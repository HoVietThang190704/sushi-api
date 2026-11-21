import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, TransactionReason } from '@prisma/client';
import { resolveBranchScope } from '@common';
import type { RequestUser } from '@common';
import { PrismaService } from '../prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import {
  addDays,
  eachDay,
  inclusiveDays,
  todayInVietnam,
  vietnamDayBoundary,
} from './vietnam-date';

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 7;
const TOP_PRODUCTS_LIMIT = 10;
const ID_CHUNK = 5000;

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? 0 : Number(v);

interface OrderRow {
  id: string;
  branchId: string;
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  createdAt: Date;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(query: AnalyticsQueryDto) {
    const today = todayInVietnam();
    const endDate = query.endDate ?? today;
    const startDate =
      query.startDate ?? addDays(endDate, -(DEFAULT_RANGE_DAYS - 1));

    // Validates calendar correctness as a side effect.
    const gte = vietnamDayBoundary(startDate);
    const lte = vietnamDayBoundary(endDate, true);
    if (gte > lte) {
      throw new BadRequestException('startDate không thể lớn hơn endDate');
    }
    const days = inclusiveDays(startDate, endDate);
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Khoảng thời gian tối đa là ${MAX_RANGE_DAYS} ngày`,
      );
    }
    return { startDate, endDate, days, gte, lte };
  }

  /** Sum of (quantity x current ingredient cost) of kitchen usage per order. */
  private async costByOrder(orderIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (orderIds.length === 0) return result;

    const usage: Array<{
      orderId: string | null;
      ingredientId: string;
      quantity: number;
    }> = [];
    for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
      const rows = await this.prisma.inventoryTransaction.groupBy({
        by: ['orderId', 'ingredientId'],
        where: {
          reason: TransactionReason.KITCHEN_USAGE,
          orderId: { in: orderIds.slice(i, i + ID_CHUNK) },
        },
        _sum: { quantity: true },
      });
      for (const r of rows) {
        usage.push({
          orderId: r.orderId,
          ingredientId: r.ingredientId,
          quantity: num(r._sum.quantity),
        });
      }
    }
    if (usage.length === 0) return result;

    const ingredientIds = [...new Set(usage.map((u) => u.ingredientId))];
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true, costPrice: true },
    });
    const costPrice = new Map(ingredients.map((i) => [i.id, num(i.costPrice)]));

    for (const u of usage) {
      if (!u.orderId) continue;
      const cost = u.quantity * (costPrice.get(u.ingredientId) ?? 0);
      result.set(u.orderId, (result.get(u.orderId) ?? 0) + cost);
    }
    return result;
  }

  async getAnalytics(query: AnalyticsQueryDto, user: RequestUser) {
    const branchScope = resolveBranchScope(user, query.branchId);
    const { startDate, endDate, days, gte, lte } = this.resolveRange(query);

    const orderWhere: Prisma.OrderWhereInput = {
      createdAt: { gte, lte },
      ...(branchScope ? { branchId: branchScope } : {}),
    };

    const orders: OrderRow[] = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        branchId: true,
        status: true,
        totalAmount: true,
        shippingFee: true,
        createdAt: true,
      },
    });

    const completed = orders.filter((o) => o.status === OrderStatus.COMPLETED);
    const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);

    const [completedCost, cancelledCost] = await Promise.all([
      this.costByOrder(completed.map((o) => o.id)),
      this.costByOrder(cancelled.map((o) => o.id)),
    ]);

    // ---- daily series & totals ----
    const daily = new Map(
      eachDay(startDate, endDate).map((date) => [
        date,
        { date, orders: 0, completedOrders: 0, revenue: 0, cogs: 0 },
      ]),
    );
    const statusBreakdown: Record<string, number> = {};
    for (const o of orders) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
      const bucket = daily.get(todayInVietnam(o.createdAt));
      if (bucket) bucket.orders += 1;
    }

    let revenue = 0;
    let shippingRevenue = 0;
    let cogs = 0;
    for (const o of completed) {
      const shipping = num(o.shippingFee);
      const productRevenue = num(o.totalAmount) - shipping;
      const cost = completedCost.get(o.id) ?? 0;
      revenue += productRevenue;
      shippingRevenue += shipping;
      cogs += cost;
      const bucket = daily.get(todayInVietnam(o.createdAt));
      if (bucket) {
        bucket.completedOrders += 1;
        bucket.revenue += productRevenue;
        bucket.cogs += cost;
      }
    }
    const cancelledAfterPrepCost = [...cancelledCost.values()].reduce(
      (a, b) => a + b,
      0,
    );
    const grossProfit = revenue - cogs;

    // ---- previous period (same length, immediately before) ----
    const prevEnd = addDays(startDate, -1);
    const prevStart = addDays(startDate, -days);
    const prev = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        createdAt: {
          gte: vietnamDayBoundary(prevStart),
          lte: vietnamDayBoundary(prevEnd, true),
        },
        ...(branchScope ? { branchId: branchScope } : {}),
      },
      _sum: { totalAmount: true, shippingFee: true },
      _count: { _all: true },
    });
    const prevRevenue = num(prev._sum.totalAmount) - num(prev._sum.shippingFee);

    // ---- top products ----
    const itemRows = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: { order: { ...orderWhere, status: OrderStatus.COMPLETED } },
      _sum: { quantity: true, subtotal: true },
    });
    const productMap = new Map<
      string,
      { productId: string; name: string; quantity: number; revenue: number }
    >();
    for (const r of itemRows) {
      const existing = productMap.get(r.productId);
      const quantity = num(r._sum.quantity);
      const rev = num(r._sum.subtotal);
      if (existing) {
        existing.quantity += quantity;
        existing.revenue += rev;
      } else {
        productMap.set(r.productId, {
          productId: r.productId,
          name: r.productName,
          quantity,
          revenue: rev,
        });
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, TOP_PRODUCTS_LIMIT)
      .map((p) => ({ ...p, revenue: round(p.revenue) }));

    // ---- per-branch breakdown (only for chain-wide view) ----
    let byBranch: Array<{
      branchId: string;
      name: string;
      completedOrders: number;
      revenue: number;
      cogs: number;
    }> = [];
    if (!branchScope) {
      const agg = new Map<
        string,
        { completedOrders: number; revenue: number; cogs: number }
      >();
      for (const o of completed) {
        const row = agg.get(o.branchId) ?? {
          completedOrders: 0,
          revenue: 0,
          cogs: 0,
        };
        row.completedOrders += 1;
        row.revenue += num(o.totalAmount) - num(o.shippingFee);
        row.cogs += completedCost.get(o.id) ?? 0;
        agg.set(o.branchId, row);
      }
      const branches = await this.prisma.branch.findMany({
        where: { id: { in: [...agg.keys()] } },
        select: { id: true, name: true },
      });
      const names = new Map(branches.map((b) => [b.id, b.name]));
      byBranch = [...agg.entries()]
        .map(([branchId, v]) => ({
          branchId,
          name: names.get(branchId) ?? branchId,
          completedOrders: v.completedOrders,
          revenue: round(v.revenue),
          cogs: round(v.cogs),
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    return {
      range: { startDate, endDate, days },
      branchId: branchScope ?? null,
      summary: {
        totalOrders: orders.length,
        completedOrders: completed.length,
        // Completed orders that actually have kitchen-usage records. When this
        // is lower than completedOrders, COGS/margin are understated.
        completedOrdersWithCost: completed.filter((o) =>
          completedCost.has(o.id),
        ).length,
        cancelledOrders: cancelled.length,
        inProgressOrders: orders.length - completed.length - cancelled.length,
        revenue: round(revenue),
        shippingRevenue: round(shippingRevenue),
        cogs: round(cogs),
        grossProfit: round(grossProfit),
        marginPct: revenue > 0 ? round((grossProfit / revenue) * 100) : null,
        avgOrderValue:
          completed.length > 0 ? round(revenue / completed.length) : 0,
        cancelledAfterPrepCost: round(cancelledAfterPrepCost),
      },
      previous: {
        startDate: prevStart,
        endDate: prevEnd,
        completedOrders: prev._count._all,
        revenue: round(prevRevenue),
        revenueChangePct:
          prevRevenue > 0
            ? round(((revenue - prevRevenue) / prevRevenue) * 100)
            : null,
      },
      statusBreakdown,
      daily: [...daily.values()].map((d) => ({
        ...d,
        revenue: round(d.revenue),
        cogs: round(d.cogs),
      })),
      topProducts,
      byBranch,
      meta: {
        revenueBasis: 'COMPLETED_ORDERS_EXCLUDING_SHIPPING',
        cogsBasis: 'KITCHEN_USAGE_QUANTITY_X_CURRENT_INGREDIENT_COST',
        timezone: 'Asia/Ho_Chi_Minh',
      },
    };
  }
}
