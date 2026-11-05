import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent } from '@contracts';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

export const DEFAULT_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class OrderingService {
  private readonly logger = new Logger(OrderingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  private generateOrderCode(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${rand}`;
  }

  private hashSecretToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createOrder(dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất 1 món');
    }

    // 1. Check idempotency key if provided
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { items: true, statusHistories: true },
      });
      if (existing) {
        return {
          order: existing,
          trackingToken: null,
          isDuplicate: true,
        };
      }
    }

    // 2. Fetch active products from catalog to snapshot name and price (DO NOT trust client prices)
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let calculatedTotal = 0;
    const orderItemsData: Array<{
      productId: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }> = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Sản phẩm ID "${item.productId}" không tồn tại hoặc đã ngừng kinh doanh`,
        );
      }
      const unitPrice = Number(product.sellingPrice);
      const subtotal = unitPrice * item.quantity;
      calculatedTotal += subtotal;

      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    // 3. Generate raw tracking token and SHA-256 hash
    const rawTrackingToken = randomBytes(24).toString('hex');
    const accessTokenHash = this.hashSecretToken(rawTrackingToken);
    const code = this.generateOrderCode();
    const branchId = dto.branchId || DEFAULT_BRANCH_ID;

    // 4. Save in database transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          code,
          branchId,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim(),
          address: dto.address?.trim(),
          province: dto.province?.trim(),
          district: dto.district?.trim(),
          ward: dto.ward?.trim(),
          note: dto.note?.trim(),
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: 'CASH',
          totalAmount: calculatedTotal,
          idempotencyKey: dto.idempotencyKey || null,
          accessTokenHash,
          items: {
            create: orderItemsData.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          reason: 'Khởi tạo đơn hàng Take Away',
          changedBy: 'CUSTOMER',
        },
      });

      return newOrder;
    });

    // 5. Emit realtime domain event
    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.created',
          resource: 'order',
          action: 'CREATED',
          branchId: order.branchId,
          payload: {
            orderId: order.id,
            orderCode: order.code,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            totalAmount: Number(order.totalAmount),
            status: order.status,
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.created event: ${message}`);
    }

    return {
      order,
      trackingToken: rawTrackingToken,
      isDuplicate: false,
    };
  }

  async trackOrder(code: string, token: string) {
    if (!code || !token) {
      throw new BadRequestException('Mã đơn hàng và mã truy cập là bắt buộc');
    }

    const order = await this.prisma.order.findUnique({
      where: { code },
      include: {
        items: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với mã "${code}"`);
    }

    const expectedHash = this.hashSecretToken(token);
    if (order.accessTokenHash !== expectedHash) {
      throw new UnauthorizedException('Mã truy cập theo dõi đơn hàng không chính xác');
    }

    // Sanitize order output: remove internal token hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accessTokenHash: _, ...sanitizedOrder } = order;
    return sanitizedOrder;
  }

  async cancelOrderByCustomer(code: string, token: string, reason?: string) {
    if (!code || !token) {
      throw new BadRequestException('Mã đơn hàng và mã truy cập là bắt buộc');
    }

    const order = await this.prisma.order.findUnique({
      where: { code },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với mã "${code}"`);
    }

    const expectedHash = this.hashSecretToken(token);
    if (order.accessTokenHash !== expectedHash) {
      throw new UnauthorizedException('Mã truy cập theo dõi đơn hàng không chính xác');
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Đơn hàng đang ở trạng thái "${order.status}", không thể tự hủy. Vui lòng liên hệ nhà hàng.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          reason: reason || 'Khách hàng tự hủy đơn',
          changedBy: 'CUSTOMER',
        },
      });

      return cancelledOrder;
    });

    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.status.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            status: updated.status,
            reason: reason || 'Khách hàng tự hủy đơn',
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.status.updated event: ${message}`);
    }

    return updated;
  }

  async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    reason?: string,
    changedBy = 'STAFF',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus,
          reason,
          changedBy,
        },
      });

      return updatedOrder;
    });

    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.status.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            fromStatus: order.status,
            status: updated.status,
            reason,
            changedBy,
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.status.updated event: ${message}`);
    }

    return updated;
  }

  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus,
      },
    });

    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.payment.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            paymentStatus: updated.paymentStatus,
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.payment.updated event: ${message}`);
    }

    return updated;
  }

  private parseVietnamDateBoundary(dateStr: string, isEndOfDay = false): Date {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new BadRequestException(
        `Ngày "${dateStr}" không đúng định dạng YYYY-MM-DD`,
      );
    }
    const [year, month, day] = parts;
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new BadRequestException(`Ngày "${dateStr}" không hợp lệ`);
    }

    const testDate = new Date(Date.UTC(year, month - 1, day));
    if (
      testDate.getUTCFullYear() !== year ||
      testDate.getUTCMonth() !== month - 1 ||
      testDate.getUTCDate() !== day
    ) {
      throw new BadRequestException(`Ngày "${dateStr}" không tồn tại trên lịch`);
    }

    // Vietnam is UTC+7 (Indochina Time).
    // Start of day in VN (00:00:00.000 +07:00) is equivalent to 17:00:00.000 UTC of previous day.
    // End of day in VN (23:59:59.999 +07:00) is equivalent to 16:59:59.999 UTC of current day.
    if (isEndOfDay) {
      return new Date(Date.UTC(year, month - 1, day, 23 - 7, 59, 59, 999));
    }
    return new Date(Date.UTC(year, month - 1, day, 0 - 7, 0, 0, 0));
  }

  async getOrders(params?: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    branchId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (params?.startDate && params?.endDate && params.startDate > params.endDate) {
      throw new BadRequestException('startDate không thể lớn hơn endDate');
    }

    const createdAtFilter: Record<string, Date> = {};
    if (params?.startDate) {
      createdAtFilter.gte = this.parseVietnamDateBoundary(params.startDate, false);
    }
    if (params?.endDate) {
      createdAtFilter.lte = this.parseVietnamDateBoundary(params.endDate, true);
    }

    return this.prisma.order.findMany({
      where: {
        status: params?.status,
        paymentStatus: params?.paymentStatus,
        branchId: params?.branchId,
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
