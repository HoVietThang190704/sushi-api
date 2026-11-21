import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '@common';
import { ReportsService } from './reports.service';
import {
  addDays,
  eachDay,
  inclusiveDays,
  vietnamDayBoundary,
} from './vietnam-date';

const D = (n: number) => n as unknown as never; // stands in for Prisma.Decimal

const admin: RequestUser = {
  sub: 'a',
  email: 'a@x.com',
  role: 'SUPER_ADMIN',
  branchId: null,
};
const manager: RequestUser = {
  sub: 'm',
  email: 'm@x.com',
  role: 'BRANCH_MANAGER',
  branchId: 'b1',
};

// 2026-11-10 12:00 VN = 05:00 UTC
const at = (day: string) => new Date(`${day}T05:00:00.000Z`);

function makeOrder(over: Record<string, unknown>) {
  return {
    id: 'o',
    branchId: 'b1',
    status: 'COMPLETED',
    totalAmount: D(115000),
    shippingFee: D(15000),
    createdAt: at('2026-11-10'),
    ...over,
  };
}

describe('vietnam-date helpers', () => {
  it('maps a VN calendar day to the right UTC window', () => {
    expect(vietnamDayBoundary('2026-11-10').toISOString()).toBe(
      '2026-11-09T17:00:00.000Z',
    );
    expect(vietnamDayBoundary('2026-11-10', true).toISOString()).toBe(
      '2026-11-10T16:59:59.999Z',
    );
  });

  it('does calendar arithmetic across month ends', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(inclusiveDays('2026-11-01', '2026-11-07')).toBe(7);
    expect(eachDay('2026-02-27', '2026-03-01')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('rejects impossible dates', () => {
    expect(() => vietnamDayBoundary('2026-02-30')).toThrow(BadRequestException);
  });
});

describe('ReportsService.getAnalytics', () => {
  let prisma: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: D(0), shippingFee: D(0) },
          _count: { _all: 0 },
        }),
      },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      inventoryTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
      ingredient: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsService(prisma);
  });

  const range = { startDate: '2026-11-04', endDate: '2026-11-10' };

  it('computes revenue (ex-shipping), COGS, profit and margin from completed orders only', async () => {
    prisma.order.findMany.mockResolvedValue([
      makeOrder({ id: 'o1' }), // revenue 100000
      makeOrder({ id: 'o2', totalAmount: D(65000), shippingFee: D(15000) }), // 50000
      makeOrder({ id: 'o3', status: 'PENDING' }),
      makeOrder({ id: 'o4', status: 'CANCELLED' }),
    ]);
    prisma.inventoryTransaction.groupBy.mockImplementation(
      async ({ where }: any) =>
        where.orderId.in.includes('o1')
          ? [
              { orderId: 'o1', ingredientId: 'i1', _sum: { quantity: D(100) } },
              { orderId: 'o2', ingredientId: 'i1', _sum: { quantity: D(50) } },
            ]
          : [{ orderId: 'o4', ingredientId: 'i1', _sum: { quantity: D(20) } }],
    );
    prisma.ingredient.findMany.mockResolvedValue([
      { id: 'i1', costPrice: D(400) },
    ]);

    const res = await service.getAnalytics(range, admin);

    expect(res.summary).toMatchObject({
      totalOrders: 4,
      completedOrders: 2,
      cancelledOrders: 1,
      inProgressOrders: 1,
      revenue: 150000,
      shippingRevenue: 30000,
      cogs: 60000, // (100 + 50) * 400
      grossProfit: 90000,
      marginPct: 60,
      avgOrderValue: 75000,
      cancelledAfterPrepCost: 8000, // 20 * 400
    });
    expect(res.statusBreakdown).toEqual({
      COMPLETED: 2,
      PENDING: 1,
      CANCELLED: 1,
    });
  });

  it('returns a zero-filled daily series and buckets by Vietnam day', async () => {
    prisma.order.findMany.mockResolvedValue([
      makeOrder({ id: 'o1', createdAt: at('2026-11-10') }),
      // 17:30 UTC on the 9th is 00:30 VN on the 10th
      makeOrder({ id: 'o2', createdAt: new Date('2026-11-09T17:30:00.000Z') }),
    ]);
    const res = await service.getAnalytics(range, admin);

    expect(res.daily).toHaveLength(7);
    const day10 = res.daily.find((d) => d.date === '2026-11-10');
    const day09 = res.daily.find((d) => d.date === '2026-11-09');
    expect(day10).toMatchObject({ orders: 2, completedOrders: 2 });
    expect(day09).toMatchObject({ orders: 0, revenue: 0 });
  });

  it('exposes how many completed orders have cost data (COGS coverage)', async () => {
    prisma.order.findMany.mockResolvedValue([
      makeOrder({ id: 'o1' }),
      makeOrder({ id: 'o2' }),
    ]);
    prisma.inventoryTransaction.groupBy.mockResolvedValue([
      { orderId: 'o1', ingredientId: 'i1', _sum: { quantity: D(10) } },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      { id: 'i1', costPrice: D(100) },
    ]);
    const res = await service.getAnalytics(range, admin);
    expect(res.summary.completedOrders).toBe(2);
    expect(res.summary.completedOrdersWithCost).toBe(1);
  });

  it('has null margin and zero AOV with no completed orders', async () => {
    const res = await service.getAnalytics(range, admin);
    expect(res.summary.marginPct).toBeNull();
    expect(res.summary.avgOrderValue).toBe(0);
    expect(res.previous.revenueChangePct).toBeNull();
  });

  it('reports revenue change against the previous equal-length period', async () => {
    prisma.order.findMany.mockResolvedValue([makeOrder({ id: 'o1' })]); // 100000
    prisma.order.aggregate.mockResolvedValue({
      _sum: { totalAmount: D(90000), shippingFee: D(10000) }, // 80000
      _count: { _all: 3 },
    });
    const res = await service.getAnalytics(range, admin);
    expect(res.previous).toMatchObject({
      startDate: '2026-10-28',
      endDate: '2026-11-03',
      completedOrders: 3,
      revenue: 80000,
      revenueChangePct: 25,
    });
  });

  it('merges product rows that share an id and ranks by quantity', async () => {
    prisma.orderItem.groupBy.mockResolvedValue([
      {
        productId: 'p1',
        productName: 'Old name',
        _sum: { quantity: 2, subtotal: D(20) },
      },
      {
        productId: 'p1',
        productName: 'New name',
        _sum: { quantity: 3, subtotal: D(30) },
      },
      {
        productId: 'p2',
        productName: 'Other',
        _sum: { quantity: 9, subtotal: D(5) },
      },
    ]);
    const res = await service.getAnalytics(range, admin);
    expect(res.topProducts.map((p) => [p.productId, p.quantity])).toEqual([
      ['p2', 9],
      ['p1', 5],
    ]);
  });

  describe('branch scoping', () => {
    it('forces a manager to own branch and omits the branch breakdown', async () => {
      const res = await service.getAnalytics(range, manager);
      expect(prisma.order.findMany.mock.calls[0][0].where.branchId).toBe('b1');
      expect(prisma.order.aggregate.mock.calls[0][0].where.branchId).toBe('b1');
      expect(res.branchId).toBe('b1');
      expect(res.byBranch).toEqual([]);
      expect(prisma.branch.findMany).not.toHaveBeenCalled();
    });

    it('rejects a manager asking for another branch', async () => {
      await expect(
        service.getAnalytics({ ...range, branchId: 'b2' }, manager),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('lets admin view the whole chain with a per-branch breakdown', async () => {
      prisma.order.findMany.mockResolvedValue([
        makeOrder({ id: 'o1', branchId: 'b1' }),
        makeOrder({ id: 'o2', branchId: 'b2', totalAmount: D(215000) }),
      ]);
      prisma.branch.findMany.mockResolvedValue([
        { id: 'b1', name: 'Q1' },
        { id: 'b2', name: 'BT' },
      ]);
      const res = await service.getAnalytics(range, admin);
      expect(
        prisma.order.findMany.mock.calls[0][0].where.branchId,
      ).toBeUndefined();
      expect(res.byBranch.map((b) => [b.name, b.revenue])).toEqual([
        ['BT', 200000],
        ['Q1', 100000],
      ]);
    });

    it('lets admin narrow to one branch', async () => {
      await service.getAnalytics({ ...range, branchId: 'b2' }, admin);
      expect(prisma.order.findMany.mock.calls[0][0].where.branchId).toBe('b2');
    });
  });

  describe('range validation', () => {
    it('rejects start after end', async () => {
      await expect(
        service.getAnalytics(
          { startDate: '2026-11-10', endDate: '2026-11-01' },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects ranges over 366 days', async () => {
      await expect(
        service.getAnalytics(
          { startDate: '2025-01-01', endDate: '2026-11-01' },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('defaults to the last 7 days when no dates are given', async () => {
      const res = await service.getAnalytics({}, admin);
      expect(res.range.days).toBe(7);
      expect(res.daily).toHaveLength(7);
    });
  });
});
