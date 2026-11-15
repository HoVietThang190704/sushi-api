import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ShippingService } from './shipping/shipping.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateStaffOrderDto } from './dto/create-staff-order.dto';
import { UpdatePaymentConfigDto } from './dto/update-payment-config.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent, ORDER_TRACK_SCOPE } from '@contracts';
import type { RequestUser } from '@common';
import {
  OrderStatus,
  PaymentStatus,
  TransactionType,
  TransactionReason,
  OutboxStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

export const DEFAULT_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class OrderingService {
  private readonly logger = new Logger(OrderingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmqService: RabbitMQService,
    private readonly jwtService: JwtService,
    private readonly shippingService: ShippingService,
  ) {}

  private generateOrderCode(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${dateStr}-${rand}`;
  }

  private hashSecretToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeOrder<
    T extends { accessTokenHash?: unknown; idempotencyFingerprint?: unknown },
  >(order: T): Omit<T, 'accessTokenHash' | 'idempotencyFingerprint'> {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      accessTokenHash: _,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      idempotencyFingerprint: __,
      ...sanitized
    } = order;
    return sanitized;
  }

  private computeIdempotencyFingerprint(
    dto: {
      branchId?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      address?: string;
      province?: string;
      district?: string;
      ward?: string;
      note?: string;
      paymentMethod?: string;
      items: Array<{ productId: string; quantity: number }>;
    },
    expectedSource: 'STOREFRONT' | 'STAFF',
  ): string {
    const normalizeStr = (val?: string | null) => (val ?? '').trim();
    const normalizeProvince = (val?: string | null) =>
      val?.trim() || 'TP. Hồ Chí Minh';
    const normalizePaymentMethod = (val?: string | null) =>
      (val?.trim() || 'CASH').toUpperCase();

    const canonicalPayload = {
      source: expectedSource,
      branchId: dto.branchId ? dto.branchId.trim() : null,
      customerName: normalizeStr(dto.customerName),
      customerPhone: normalizeStr(dto.customerPhone),
      customerEmail: normalizeStr(dto.customerEmail),
      address: normalizeStr(dto.address),
      province: normalizeProvince(dto.province),
      district: normalizeStr(dto.district),
      ward: normalizeStr(dto.ward),
      note: normalizeStr(dto.note),
      paymentMethod: normalizePaymentMethod(dto.paymentMethod),
      itemsSignature: this.buildItemsSignature(dto.items || []),
    };

    return createHash('sha256')
      .update(JSON.stringify(canonicalPayload))
      .digest('hex');
  }

  private buildItemsSignature(
    items: Array<{ productId: string; quantity: number }>,
  ): string {
    const aggregated = new Map<string, number>();
    for (const item of items) {
      aggregated.set(
        item.productId,
        (aggregated.get(item.productId) || 0) + Number(item.quantity),
      );
    }
    return Array.from(aggregated.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([productId, quantity]) => `${productId}:${quantity}`)
      .join('|');
  }

  private assertIdempotencyMatchesOrder(
    existing: {
      branchId?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      customerEmail?: string | null;
      address?: string | null;
      province?: string | null;
      district?: string | null;
      ward?: string | null;
      note?: string | null;
      paymentMethod?: string | null;
      source?: string | null;
      items?: Array<{ productId: string; quantity: number }>;
    },
    dto: {
      branchId?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      address?: string;
      province?: string;
      district?: string;
      ward?: string;
      note?: string;
      paymentMethod?: string;
      items: Array<{ productId: string; quantity: number }>;
    },
    expectedSource?: 'STOREFRONT' | 'STAFF',
  ) {
    const normalizeStr = (val?: string | null) => (val ?? '').trim();
    const normalizeProvince = (val?: string | null) =>
      val?.trim() || 'TP. Hồ Chí Minh';
    const normalizePaymentMethod = (val?: string | null) =>
      (val?.trim() || 'CASH').toUpperCase();

    const sourceMismatch =
      Boolean(expectedSource && existing.source) &&
      existing.source !== expectedSource;
    const requestedBranchId = dto.branchId?.trim();
    const branchMismatch =
      !requestedBranchId || existing.branchId !== requestedBranchId;
    const customerNameMismatch =
      normalizeStr(existing.customerName) !== normalizeStr(dto.customerName);
    const phoneMismatch =
      normalizeStr(existing.customerPhone) !== normalizeStr(dto.customerPhone);
    const emailMismatch =
      normalizeStr(existing.customerEmail) !== normalizeStr(dto.customerEmail);
    const addressMismatch =
      normalizeStr(existing.address) !== normalizeStr(dto.address);
    const provinceMismatch =
      normalizeProvince(existing.province) !== normalizeProvince(dto.province);
    const districtMismatch =
      normalizeStr(existing.district) !== normalizeStr(dto.district);
    const wardMismatch = normalizeStr(existing.ward) !== normalizeStr(dto.ward);
    const noteMismatch = normalizeStr(existing.note) !== normalizeStr(dto.note);
    const paymentMethodMismatch =
      normalizePaymentMethod(existing.paymentMethod) !==
      normalizePaymentMethod(dto.paymentMethod);

    const existingItemsSig = this.buildItemsSignature(existing.items || []);
    const requestItemsSig = this.buildItemsSignature(dto.items || []);

    if (
      sourceMismatch ||
      branchMismatch ||
      customerNameMismatch ||
      phoneMismatch ||
      emailMismatch ||
      addressMismatch ||
      provinceMismatch ||
      districtMismatch ||
      wardMismatch ||
      noteMismatch ||
      paymentMethodMismatch ||
      existingItemsSig !== requestItemsSig
    ) {
      throw new ConflictException(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );
    }
  }

  private isIdempotencyUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const candidate = err as {
      code?: unknown;
      meta?: { target?: unknown };
      message?: unknown;
    };
    if (candidate.code !== 'P2002') {
      return false;
    }
    const target = candidate.meta?.target;
    if (Array.isArray(target)) {
      return target.some(
        (t) =>
          typeof t === 'string' &&
          (t === 'idempotency_key' || t === 'idempotencyKey'),
      );
    }
    if (typeof target === 'string') {
      return (
        target.includes('idempotency_key') || target.includes('idempotencyKey')
      );
    }
    return false;
  }

  private async resolveDuplicatePublicOrder(dto: CreateOrderDto) {
    if (!dto.idempotencyKey) {
      return null;
    }
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { items: true, statusHistories: true },
    });
    if (!existing) {
      return null;
    }

    if (existing.idempotencyFingerprint) {
      const requestFingerprint = this.computeIdempotencyFingerprint(
        dto,
        'STOREFRONT',
      );
      if (existing.idempotencyFingerprint !== requestFingerprint) {
        throw new ConflictException(
          'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
        );
      }
    } else {
      this.assertIdempotencyMatchesOrder(existing, dto, 'STOREFRONT');
    }

    return {
      order: null,
      trackingToken: null,
      isDuplicate: true,
      message:
        'Yêu cầu đặt hàng trùng lặp đã được tiếp nhận trước đó. Vui lòng sử dụng mã đơn hàng và mã theo dõi đã cấp ban đầu để tra cứu.',
    };
  }

  private async resolveDuplicateStaffOrder(
    dto: CreateStaffOrderDto,
    user?: RequestUser,
  ) {
    if (!dto.idempotencyKey) {
      return null;
    }
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { items: true, statusHistories: true },
    });
    if (!existing) {
      return null;
    }
    if (
      user &&
      user.role !== 'SUPER_ADMIN' &&
      existing.branchId !== user.branchId
    ) {
      throw new ForbiddenException(
        'Khóa trùng lặp (idempotency key) đã được sử dụng cho đơn hàng thuộc chi nhánh khác!',
      );
    }
    if (existing.idempotencyFingerprint) {
      const requestFingerprint = this.computeIdempotencyFingerprint(
        dto,
        'STAFF',
      );
      if (existing.idempotencyFingerprint !== requestFingerprint) {
        throw new ConflictException(
          'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
        );
      }
    } else {
      this.assertIdempotencyMatchesOrder(existing, dto, 'STAFF');
    }
    return {
      order: this.sanitizeOrder(existing),
      trackingToken: null,
      isDuplicate: true,
    };
  }

  async createOrder(dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất 1 món');
    }
    for (const field of ['address', 'district', 'ward'] as const) {
      if (typeof dto[field] !== 'string' || !dto[field].trim()) {
        throw new BadRequestException(`${field} is required for delivery`);
      }
    }

    // 1. Check idempotency key if provided
    const preflightDuplicate = await this.resolveDuplicatePublicOrder(dto);
    if (preflightDuplicate) {
      return preflightDuplicate;
    }

    // 2. Check store configuration: If customer ordering is disabled, block new storefront orders
    const storeConfig = await this.getStoreConfig();
    if (!storeConfig.customerOrderingEnabled) {
      throw new BadRequestException(
        'Cửa hàng hiện đang tạm ngưng nhận đặt món trực tuyến. Quý khách vui lòng liên hệ hotline để được phục vụ.',
      );
    }

    // 3. Fetch active products from catalog to snapshot name and price (DO NOT trust client prices)
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

    // 3. Tính phí giao hàng (Shipping Fee) dựa vào Xã/Phường & Chi nhánh
    const shippingCalculation = await this.shippingService.calculateShipping({
      district: dto.district,
      ward: dto.ward,
      branchId: dto.branchId,
    });
    const shippingFee = shippingCalculation.fee;
    const effectiveBranchId = shippingCalculation.branch.id;

    const finalTotalAmount = calculatedTotal + shippingFee;

    // 4. Generate raw tracking token and SHA-256 hash
    const rawTrackingToken = randomBytes(24).toString('hex');
    const accessTokenHash = this.hashSecretToken(rawTrackingToken);
    const code = this.generateOrderCode();
    const branchId = effectiveBranchId;

    // Snapshot cấu hình thanh toán chuyển khoản nếu khách chọn VIETQR / BANK_TRANSFER
    let paymentQrUrl: string | null = null;
    let paymentBankInfo: string | null = null;
    const normalizedMethod = dto.paymentMethod?.trim().toUpperCase() || 'CASH';

    if (normalizedMethod === 'VIETQR' || normalizedMethod === 'BANK_TRANSFER') {
      const activeConfig = await this.getPaymentConfig();
      if (activeConfig && activeConfig.isActive) {
        paymentQrUrl = activeConfig.qrImageUrl || null;
        paymentBankInfo = JSON.stringify({
          bankName: activeConfig.bankName,
          accountNumber: activeConfig.accountNumber,
          accountHolder: activeConfig.accountHolder,
          transferSyntax: activeConfig.transferSyntax,
          note: activeConfig.note,
        });
      }
    }

    // 5. Save in database transaction
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            code,
            branchId,
            customerName: dto.customerName.trim(),
            customerPhone: dto.customerPhone.trim(),
            customerEmail: dto.customerEmail?.trim(),
            address: dto.address?.trim(),
            province: dto.province?.trim() || 'TP. Hồ Chí Minh',
            district: dto.district?.trim(),
            ward: dto.ward?.trim(),
            note: dto.note?.trim(),
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            paymentMethod: dto.paymentMethod?.trim() || 'CASH',
            shippingFee,
            totalAmount: finalTotalAmount,
            paymentQrUrl,
            paymentBankInfo,
            idempotencyKey: dto.idempotencyKey || null,
            idempotencyFingerprint: dto.idempotencyKey
              ? this.computeIdempotencyFingerprint(dto, 'STOREFRONT')
              : null,
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
            reason: 'Khởi tạo đơn hàng Giao tận nơi (Delivery)',
            changedBy: 'CUSTOMER',
          },
        });

        return newOrder;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && this.isIdempotencyUniqueViolation(err)) {
        const raceDuplicate = await this.resolveDuplicatePublicOrder(dto);
        if (raceDuplicate) {
          return raceDuplicate;
        }
      }
      throw err;
    }

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
      order: this.sanitizeOrder(order),
      trackingToken: rawTrackingToken,
      isDuplicate: false,
    };
  }

  async createStaffOrder(
    dto: CreateStaffOrderDto,
    staffId?: string,
    role?: string,
    user?: RequestUser,
  ) {
    const allowedRoles = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'];
    const effectiveRole = user?.role || role;
    if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
      throw new UnauthorizedException(
        'Bạn không có quyền tạo đơn hàng nhân viên',
      );
    }

    if (user && user.role !== 'SUPER_ADMIN') {
      if (!user.branchId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
        );
      }
      if (dto.branchId !== user.branchId) {
        throw new ForbiddenException(
          'Bạn chỉ có quyền tạo đơn hàng cho chi nhánh được phân công!',
        );
      }
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất 1 món');
    }

    // 1. Check idempotency key if provided
    const preflightStaffDuplicate = await this.resolveDuplicateStaffOrder(
      dto,
      user,
    );
    if (preflightStaffDuplicate) {
      return preflightStaffDuplicate;
    }

    // 2. Validate branch
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch || !branch.isActive) {
      throw new BadRequestException(
        'Chi nhánh được chọn không tồn tại hoặc đã ngừng hoạt động',
      );
    }

    // 3. Fetch active products from catalog to snapshot name and price (DO NOT trust client prices)
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

    // 4. Calculate shipping fee
    let shippingFee = 0;
    if (dto.ward) {
      const shippingCalculation = await this.shippingService.calculateShipping({
        district: dto.district,
        ward: dto.ward,
        branchId: dto.branchId,
      });
      shippingFee = shippingCalculation.fee;
    }

    const finalTotalAmount = calculatedTotal + shippingFee;

    // 5. Generate raw tracking token and SHA-256 hash
    const rawTrackingToken = randomBytes(24).toString('hex');
    const accessTokenHash = this.hashSecretToken(rawTrackingToken);
    const code = this.generateOrderCode();

    // Snapshot cấu hình thanh toán chuyển khoản nếu khách chọn VIETQR / BANK_TRANSFER
    let paymentQrUrl: string | null = null;
    let paymentBankInfo: string | null = null;
    const normalizedMethod = dto.paymentMethod?.trim().toUpperCase() || 'CASH';

    if (normalizedMethod === 'VIETQR' || normalizedMethod === 'BANK_TRANSFER') {
      const activeConfig = await this.getPaymentConfig();
      if (activeConfig && activeConfig.isActive) {
        paymentQrUrl = activeConfig.qrImageUrl || null;
        paymentBankInfo = JSON.stringify({
          bankName: activeConfig.bankName,
          accountNumber: activeConfig.accountNumber,
          accountHolder: activeConfig.accountHolder,
          transferSyntax: activeConfig.transferSyntax,
          note: activeConfig.note,
        });
      }
    }

    // 6. Save in database transaction
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            code,
            branchId: dto.branchId,
            customerName: dto.customerName.trim(),
            customerPhone: dto.customerPhone.trim(),
            customerEmail: dto.customerEmail?.trim(),
            address: dto.address?.trim(),
            province: dto.province?.trim() || 'TP. Hồ Chí Minh',
            district: dto.district?.trim(),
            ward: dto.ward?.trim(),
            note: dto.note?.trim(),
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            paymentMethod: dto.paymentMethod?.trim() || 'CASH',
            source: 'STAFF',
            shippingFee,
            totalAmount: finalTotalAmount,
            paymentQrUrl,
            paymentBankInfo,
            idempotencyKey: dto.idempotencyKey || null,
            idempotencyFingerprint: dto.idempotencyKey
              ? this.computeIdempotencyFingerprint(dto, 'STAFF')
              : null,
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
            reason: 'Nhân viên tạo đơn giao tận nơi qua điện thoại',
            changedBy: staffId || role || 'STAFF',
          },
        });

        return newOrder;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && this.isIdempotencyUniqueViolation(err)) {
        const raceStaffDuplicate = await this.resolveDuplicateStaffOrder(
          dto,
          user,
        );
        if (raceStaffDuplicate) {
          return raceStaffDuplicate;
        }
      }
      throw err;
    }

    // 7. Emit realtime domain event
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
            source: 'STAFF',
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.created event: ${message}`);
    }

    return {
      order: this.sanitizeOrder(order),
      trackingToken: rawTrackingToken,
      isDuplicate: false,
    };
  }

  async trackOrder(code: string, token?: string, phone?: string) {
    if (!code) {
      throw new BadRequestException('Mã đơn hàng là bắt buộc');
    }
    if (!token && !phone) {
      throw new BadRequestException(
        'Mã truy cập hoặc số điện thoại là bắt buộc để theo dõi đơn hàng',
      );
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

    let canCancel = false;
    let trackingTicket: string | undefined = undefined;

    if (token) {
      const expectedHash = this.hashSecretToken(token);
      if (order.accessTokenHash !== expectedHash) {
        throw new UnauthorizedException(
          'Mã truy cập theo dõi đơn hàng không chính xác',
        );
      }
      canCancel =
        order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.CONFIRMED;

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedException(
          'JWT_SECRET is not configured on server',
        );
      }

      trackingTicket = this.jwtService.sign(
        {
          orderCode: order.code,
          scope: ORDER_TRACK_SCOPE,
        },
        {
          secret,
          expiresIn: '24h',
        },
      );
    } else if (phone) {
      const clearInputPhone = phone.replace(/\D/g, '');
      const clearCustomerPhone = order.customerPhone.replace(/\D/g, '');
      if (clearInputPhone !== clearCustomerPhone) {
        throw new UnauthorizedException(
          'Số điện thoại không khớp với thông tin khách hàng của đơn hàng',
        );
      }
      canCancel = false;
    }

    // Sanitize order output: remove internal token hash and include canCancel flag & trackingTicket
    return {
      ...this.sanitizeOrder(order),
      canCancel,
      trackingTicket,
    };
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
      throw new UnauthorizedException(
        'Mã truy cập theo dõi đơn hàng không chính xác',
      );
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
      const current = tx.order?.findUnique
        ? await tx.order.findUnique({
            where: { id: order.id },
            select: { id: true, status: true, code: true, branchId: true },
          })
        : order;

      if (
        !current ||
        (current.status !== OrderStatus.PENDING &&
          current.status !== OrderStatus.CONFIRMED)
      ) {
        throw new BadRequestException(
          `Đơn hàng đang ở trạng thái "${current?.status || 'Đã xoá'}", không thể tự hủy. Vui lòng liên hệ nhà hàng.`,
        );
      }

      if (tx.order?.updateMany) {
        const updateResult = await tx.order.updateMany({
          where: {
            id: order.id,
            status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
          },
          data: {
            status: OrderStatus.CANCELLED,
          },
        });
        if (updateResult && updateResult.count === 0) {
          throw new BadRequestException(
            'Đơn hàng đã bị thay đổi trạng thái bởi thao tác khác. Không thể tự hủy!',
          );
        }
      }

      const cancelledOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: current.status,
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
      this.logger.warn(
        `Failed to publish order.status.updated event: ${message}`,
      );
    }

    return this.sanitizeOrder(updated);
  }

  private generateTxCode(type: TransactionType): string {
    const prefix = type === TransactionType.IN ? 'PNK' : 'PXK';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${dateStr}-${rand}`;
  }

  async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    reason?: string,
    changedBy = 'STAFF',
    user?: RequestUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        // SUPER_ADMIN có toàn quyền trên tất cả chi nhánh và mọi trạng thái
      } else if (
        user.role === 'BRANCH_MANAGER' ||
        user.role === 'CASHIER' ||
        user.role === 'KITCHEN_STAFF'
      ) {
        if (!user.branchId) {
          throw new ForbiddenException(
            'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
          );
        }
        if (order.branchId !== user.branchId) {
          throw new ForbiddenException(
            'Bạn chỉ có quyền thao tác trên đơn hàng thuộc chi nhánh của mình!',
          );
        }

        // Kiểm tra phạm vi trạng thái được phép theo từng chức danh
        if (user.role === 'CASHIER') {
          const allowedCashierTransitions: Partial<
            Record<OrderStatus, OrderStatus[]>
          > = {
            [OrderStatus.PENDING]: [
              OrderStatus.CONFIRMED,
              OrderStatus.CANCELLED,
            ],
            [OrderStatus.CONFIRMED]: [OrderStatus.CANCELLED],
          };
          const allowedCashierStatuses: OrderStatus[] = [
            OrderStatus.CONFIRMED,
            OrderStatus.CANCELLED,
          ];
          if (!allowedCashierStatuses.includes(toStatus)) {
            throw new ForbiddenException(
              'Thu ngân chỉ có quyền Xác nhận đơn (CONFIRMED) hoặc Hủy đơn (CANCELLED). Việc chế biến do Bếp đảm nhận!',
            );
          }
          const allowedTargetsForCurrent =
            allowedCashierTransitions[order.status] || [];
          if (!allowedTargetsForCurrent.includes(toStatus)) {
            throw new BadRequestException(
              `Thu ngân không thể chuyển đơn từ trạng thái ${order.status} sang ${toStatus}. Chỉ có thể xác nhận từ PENDING hoặc hủy đơn trước khi chế biến (PENDING / CONFIRMED)!`,
            );
          }
        } else if (user.role === 'KITCHEN_STAFF') {
          const allowedKitchenStatuses: OrderStatus[] = [
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
          ];
          if (!allowedKitchenStatuses.includes(toStatus)) {
            throw new ForbiddenException(
              'Nhân viên bếp chỉ có quyền Chế biến (PREPARING) hoặc Chế biến xong (READY_FOR_PICKUP)!',
            );
          }
        }
      } else {
        throw new ForbiddenException(
          'Bạn không có quyền cập nhật trạng thái đơn hàng!',
        );
      }
    }

    // Ràng buộc đơn thanh toán chuyển khoản: bắt buộc phải có paymentStatus === 'PAID' trước khi CONFIRMED hoặc PREPARING
    const isTransferMethod =
      order.paymentMethod?.toUpperCase() === 'VIETQR' ||
      order.paymentMethod?.toUpperCase() === 'BANK_TRANSFER';

    if (
      isTransferMethod &&
      order.paymentStatus !== PaymentStatus.PAID &&
      (toStatus === OrderStatus.CONFIRMED || toStatus === OrderStatus.PREPARING)
    ) {
      throw new BadRequestException(
        'Đơn hàng thanh toán chuyển khoản cần được xác nhận thanh toán (Đã thanh toán) trước khi duyệt đơn hoặc chế biến!',
      );
    }

    if (
      toStatus === OrderStatus.READY_FOR_PICKUP &&
      order.status !== OrderStatus.PREPARING
    ) {
      throw new BadRequestException(
        `Đơn hàng cần ở trạng thái Đang chế biến (PREPARING) trước khi chuyển sang Sẵn sàng giao/lấy (READY_FOR_PICKUP). Trạng thái hiện tại: ${order.status}`,
      );
    }

    // 1. Kiểm tra ràng buộc chuyển trạng thái nghiêm ngặt sang PREPARING
    let warehouseId: string | null = null;
    const requiredIngredientsMap: Record<
      string,
      { ingredientId: string; name: string; unit: string; quantity: number }
    > = {};

    if (toStatus === OrderStatus.PREPARING) {
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Đơn hàng cần được Xác nhận (CONFIRMED) trước khi bắt đầu chế biến. Trạng thái hiện tại: ${order.status}`,
        );
      }

      // Kiểm tra xem đơn đã từng được trừ kho trước đó chưa (idempotent)
      const existingDeduction =
        await this.prisma.orderRecipeDeduction.findUnique({
          where: { orderId: order.id },
        });

      if (!existingDeduction) {
        // Lấy chi nhánh và kho phụ trách
        const branch = await this.prisma.branch.findUnique({
          where: { id: order.branchId },
          include: { warehouse: true },
        });

        if (!branch || !branch.warehouseId) {
          throw new BadRequestException(
            `Chi nhánh phục vụ đơn hàng (${branch?.name || order.branchId}) chưa được cấu hình Kho nguyên vật liệu!`,
          );
        }
        warehouseId = branch.warehouseId;
        const warehouseName = branch.warehouse?.name || 'Kho chi nhánh';

        // Phân rã giỏ hàng và tính định mức công thức (Batch query chống N+1)
        const orderItems = order.items || [];
        const productIds = orderItems.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          include: {
            comboItemsAsParent: {
              include: {
                childProduct: true,
              },
            },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        const recipeTargetProductIds = new Set<string>();
        for (const item of orderItems) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new BadRequestException(
              `Sản phẩm "${item.productName || item.productId}" không tồn tại hoặc đã ngừng kinh doanh!`,
            );
          }
          if (product.type === 'SINGLE') {
            recipeTargetProductIds.add(product.id);
          } else if (product.type === 'COMBO') {
            for (const cItem of product.comboItemsAsParent) {
              recipeTargetProductIds.add(cItem.childProductId);
            }
          }
        }

        type LoadedRecipe = {
          productId: string;
          isActive: boolean;
          items: Array<{
            ingredientId: string;
            quantity: number | Prisma.Decimal;
            ingredient?: { name?: string; unit?: string } | null;
          }>;
        };

        let batchedRecipeMap: Map<string, LoadedRecipe> | null = null;
        if (
          recipeTargetProductIds.size > 0 &&
          typeof this.prisma.recipe?.findMany === 'function'
        ) {
          const batchedRecipes = await this.prisma.recipe.findMany({
            where: { productId: { in: Array.from(recipeTargetProductIds) } },
            include: {
              items: {
                include: { ingredient: true },
              },
            },
          });
          if (Array.isArray(batchedRecipes)) {
            batchedRecipeMap = new Map(
              batchedRecipes.map((r) => [r.productId, r]),
            );
          }
        }

        const resolveRecipe = async (
          targetProductId: string,
        ): Promise<LoadedRecipe | null> => {
          if (batchedRecipeMap) {
            return batchedRecipeMap.get(targetProductId) ?? null;
          }
          return await this.prisma.recipe.findUnique({
            where: { productId: targetProductId },
            include: {
              items: {
                include: { ingredient: true },
              },
            },
          });
        };

        const accumulateRecipeItems = (
          recipeItems: LoadedRecipe['items'],
          multiplier: number,
        ) => {
          for (const rItem of recipeItems) {
            const ingId = rItem.ingredientId;
            const needed = Number(rItem.quantity) * multiplier;
            if (!requiredIngredientsMap[ingId]) {
              requiredIngredientsMap[ingId] = {
                ingredientId: ingId,
                name: rItem.ingredient?.name || ingId,
                unit: rItem.ingredient?.unit || '',
                quantity: 0,
              };
            }
            requiredIngredientsMap[ingId].quantity += needed;
          }
        };

        for (const item of orderItems) {
          const product = productMap.get(item.productId)!;

          if (product.type === 'SINGLE') {
            const recipe = await resolveRecipe(product.id);
            if (!recipe || !recipe.isActive || recipe.items.length === 0) {
              throw new BadRequestException(
                `Món ăn "${item.productName || product.name}" chưa có công thức định mức nguyên vật liệu!`,
              );
            }
            accumulateRecipeItems(recipe.items, item.quantity);
          } else if (product.type === 'COMBO') {
            for (const cItem of product.comboItemsAsParent) {
              const childQty = item.quantity * Number(cItem.quantity);
              const childRecipe = await resolveRecipe(cItem.childProductId);
              if (
                !childRecipe ||
                !childRecipe.isActive ||
                childRecipe.items.length === 0
              ) {
                throw new BadRequestException(
                  `Món con "${cItem.childProduct?.name || cItem.childProductId}" trong combo "${item.productName}" chưa có công thức định mức!`,
                );
              }
              accumulateRecipeItems(childRecipe.items, childQty);
            }
          }
        }

        // Kiểm tra tồn kho tại WarehouseStock (Batch query chống N+1)
        const insufficientList: Array<{
          name: string;
          required: number;
          available: number;
          unit: string;
        }> = [];

        const requiredIngList = Object.values(requiredIngredientsMap);
        let batchedStockMap: Map<
          string,
          { ingredientId: string; currentStock: number | Prisma.Decimal }
        > | null = null;

        if (
          requiredIngList.length > 0 &&
          typeof this.prisma.warehouseStock?.findMany === 'function'
        ) {
          const batchedStocks = await this.prisma.warehouseStock.findMany({
            where: {
              warehouseId,
              ingredientId: {
                in: requiredIngList.map((req) => req.ingredientId),
              },
            },
          });
          if (Array.isArray(batchedStocks)) {
            batchedStockMap = new Map(
              batchedStocks.map((s) => [s.ingredientId, s]),
            );
          }
        }

        for (const req of requiredIngList) {
          const stockRecord = batchedStockMap
            ? (batchedStockMap.get(req.ingredientId) ?? null)
            : await this.prisma.warehouseStock.findUnique({
                where: {
                  warehouseId_ingredientId: {
                    warehouseId,
                    ingredientId: req.ingredientId,
                  },
                },
              });

          const available = stockRecord ? Number(stockRecord.currentStock) : 0;
          if (available < req.quantity) {
            insufficientList.push({
              name: req.name,
              required: req.quantity,
              available,
              unit: req.unit,
            });
          }
        }

        if (insufficientList.length > 0) {
          const detailMsg = insufficientList
            .map(
              (i) =>
                `• ${i.name}: Cần ${i.required} ${i.unit}, Hiện có ${i.available} ${i.unit}`,
            )
            .join('; ');
          throw new BadRequestException(
            `Kho "${warehouseName}" không đủ nguyên vật liệu để chế biến đơn hàng ${order.code}: ${detailMsg}`,
          );
        }
      }
    }

    // Thực hiện trong 1 transaction duy nhất: Khấu trừ tồn kho + Cập nhật trạng thái đơn
    const { updatedOrder, outboxRecord, realtimeEvent } =
      await this.prisma.$transaction(async (tx) => {
        // Kiểm tra concurrency: đảm bảo trạng thái đơn không bị thay đổi bởi thao tác khác
        const currentOrder = tx.order?.findUnique
          ? await tx.order.findUnique({
              where: { id: orderId },
              select: { id: true, status: true, code: true, branchId: true },
            })
          : order;

        if (!currentOrder || currentOrder.status !== order.status) {
          throw new BadRequestException(
            `Trạng thái đơn hàng ${order.code} đã bị thay đổi bởi thao tác khác (hiện tại: ${currentOrder?.status || 'Đã xoá'}). Vui lòng tải lại trang!`,
          );
        }

        if (tx.order?.updateMany) {
          const updateCount = await tx.order.updateMany({
            where: {
              id: orderId,
              status: order.status,
            },
            data: {
              status: toStatus,
            },
          });
          if (updateCount && updateCount.count === 0) {
            throw new BadRequestException(
              `Trạng thái đơn hàng ${order.code} đã bị thay đổi bởi thao tác khác. Vui lòng tải lại trang!`,
            );
          }
        }

        if (
          toStatus === OrderStatus.PREPARING &&
          warehouseId &&
          Object.keys(requiredIngredientsMap).length > 0
        ) {
          // Đảm bảo idempotent trong transaction
          const txExistingDeduction = tx.orderRecipeDeduction?.findUnique
            ? await tx.orderRecipeDeduction.findUnique({
                where: { orderId: order.id },
              })
            : null;
          if (txExistingDeduction) {
            throw new BadRequestException(
              `Đơn hàng ${order.code} đã được khấu trừ kho trước đó!`,
            );
          }

          // Sắp xếp nguyên liệu theo ingredientId để tránh deadlock khi nhiều đơn cùng trừ
          const sortedIngredients = Object.values(requiredIngredientsMap).sort(
            (a, b) => a.ingredientId.localeCompare(b.ingredientId),
          );

          // Pha 1: Khóa inventory.ingredients theo thứ tự ingredientId (nhất quán với inventory-service)
          if (typeof tx.$queryRaw === 'function') {
            for (const req of sortedIngredients) {
              await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id
                FROM inventory.ingredients
                WHERE id = ${req.ingredientId}::uuid
                FOR UPDATE
              `;
            }
          }

          // Pha 2: Khóa inventory.warehouse_stocks theo thứ tự ingredientId và kiểm tra tồn kho thực tế
          const lockedStockByIngredient = new Map<string, number>();
          for (const req of sortedIngredients) {
            let currentStockRecord: { id: string; currentStock: any } | null =
              null;
            if (typeof tx.$queryRaw === 'function') {
              const rows = await tx.$queryRaw<
                Array<{ id: string; currentStock: any }>
              >`
                SELECT id, current_stock AS "currentStock"
                FROM inventory.warehouse_stocks
                WHERE warehouse_id = ${warehouseId}::uuid AND ingredient_id = ${req.ingredientId}::uuid
                FOR UPDATE
              `;
              if (Array.isArray(rows) && rows.length > 0) {
                currentStockRecord = rows[0];
              }
            } else {
              currentStockRecord = await tx.warehouseStock.findUnique({
                where: {
                  warehouseId_ingredientId: {
                    warehouseId,
                    ingredientId: req.ingredientId,
                  },
                },
              });
            }

            const cur = currentStockRecord
              ? Number(currentStockRecord.currentStock)
              : 0;
            if (cur < req.quantity) {
              throw new BadRequestException(
                `Kho không đủ nguyên liệu "${req.name}" (Yêu cầu: ${req.quantity} ${req.unit}, Tồn thực tế: ${cur} ${req.unit})`,
              );
            }
            lockedStockByIngredient.set(req.ingredientId, cur);
          }

          // Pha 3: Cập nhật tồn kho và ghi nhận giao dịch xuất kho
          for (const req of sortedIngredients) {
            const cur = lockedStockByIngredient.get(req.ingredientId) ?? 0;
            const updatedStock = cur - req.quantity;

            await tx.warehouseStock.update({
              where: {
                warehouseId_ingredientId: {
                  warehouseId,
                  ingredientId: req.ingredientId,
                },
              },
              data: {
                currentStock: updatedStock,
              },
            });

            if (tx.ingredient?.update) {
              await tx.ingredient.update({
                where: { id: req.ingredientId },
                data: {
                  currentStock: { decrement: req.quantity },
                },
              });
            }

            await tx.inventoryTransaction.create({
              data: {
                code: this.generateTxCode(TransactionType.OUT),
                type: TransactionType.OUT,
                reason: TransactionReason.KITCHEN_USAGE,
                warehouseId,
                orderId: order.id,
                ingredientId: req.ingredientId,
                quantity: req.quantity,
                note: `Xuất kho chế biến đơn hàng ${order.code}`,
                createdBy: changedBy,
              },
            });
          }

          await tx.orderRecipeDeduction.create({
            data: {
              orderId: order.id,
              orderCode: order.code,
              warehouseId,
            },
          });
        }

        const updated = await tx.order.update({
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

        const domainEvent = createRealtimeEvent({
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
        });

        let outbox = null;
        if (tx.outboxEvent) {
          outbox = await tx.outboxEvent.create({
            data: {
              aggregateType: 'order',
              aggregateId: updated.id,
              eventType: domainEvent.type,
              payload: domainEvent as unknown as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
              claimedBy: 'inline-publisher',
              claimedUntil: new Date(Date.now() + 15_000),
            },
          });
        }

        return {
          updatedOrder: updated,
          outboxRecord: outbox,
          realtimeEvent: domainEvent,
        };
      });

    try {
      const published = await this.rabbitmqService.publishEvent(realtimeEvent);
      if (published && outboxRecord && this.prisma.outboxEvent) {
        await this.prisma.outboxEvent.update({
          where: { id: outboxRecord.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            claimedBy: null,
            claimedUntil: null,
          },
        });
      } else if (
        !published &&
        outboxRecord &&
        this.prisma.outboxEvent?.updateMany
      ) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: outboxRecord.id, claimedBy: 'inline-publisher' },
          data: { claimedBy: null, claimedUntil: null },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish order.status.updated event: ${message}`,
      );
      if (outboxRecord && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent
          .updateMany({
            where: { id: outboxRecord.id, claimedBy: 'inline-publisher' },
            data: { claimedBy: null, claimedUntil: null },
          })
          .catch(() => undefined);
      }
    }

    return this.sanitizeOrder(updatedOrder);
  }

  async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    user?: RequestUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        // SUPER_ADMIN có toàn quyền
      } else if (user.role === 'BRANCH_MANAGER' || user.role === 'CASHIER') {
        if (!user.branchId) {
          throw new ForbiddenException(
            'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
          );
        }
        if (order.branchId !== user.branchId) {
          throw new ForbiddenException(
            'Bạn chỉ có quyền thao tác trên đơn hàng thuộc chi nhánh của mình!',
          );
        }
      } else {
        throw new ForbiddenException(
          'Chỉ Thu ngân hoặc Quản lý chi nhánh mới có quyền cập nhật trạng thái thanh toán!',
        );
      }
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
      this.logger.warn(
        `Failed to publish order.payment.updated event: ${message}`,
      );
    }

    return this.sanitizeOrder(updated);
  }

  async getPaymentConfig() {
    let config = await this.prisma.paymentConfig.findUnique({
      where: { key: 'DEFAULT' },
    });

    if (!config) {
      config = await this.prisma.paymentConfig.create({
        data: {
          key: 'DEFAULT',
          bankName: 'MB Bank (Ngân hàng Quân Đội)',
          accountNumber: '0988888888',
          accountHolder: 'HANBI SUSHI PLATFORM',
          qrImageUrl: null,
          transferSyntax: 'HANBI',
          note: 'Vui lòng ghi đúng nội dung chuyển khoản để nhân viên đối chiếu và xác nhận nhanh nhất.',
          isActive: false,
        },
      });
    }

    return config;
  }

  async updatePaymentConfig(dto: UpdatePaymentConfigDto) {
    const existing = await this.getPaymentConfig();

    return this.prisma.paymentConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.bankName !== undefined && { bankName: dto.bankName?.trim() }),
        ...(dto.accountNumber !== undefined && {
          accountNumber: dto.accountNumber?.trim(),
        }),
        ...(dto.accountHolder !== undefined && {
          accountHolder: dto.accountHolder?.trim(),
        }),
        ...(dto.qrImageUrl !== undefined && {
          qrImageUrl: dto.qrImageUrl?.trim() || null,
        }),
        ...(dto.transferSyntax !== undefined && {
          transferSyntax: dto.transferSyntax?.trim().toUpperCase(),
        }),
        ...(dto.note !== undefined && { note: dto.note?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async getStoreConfig() {
    let config = await this.prisma.storeConfig.findUnique({
      where: { key: 'DEFAULT' },
    });

    if (!config) {
      config = await this.prisma.storeConfig.create({
        data: {
          key: 'DEFAULT',
          customerOrderingEnabled: true,
          contactPhone: '0988888888',
        },
      });
    }

    return config;
  }

  async updateStoreConfig(dto: UpdateStoreConfigDto, userRole?: string) {
    if (userRole !== 'SUPER_ADMIN') {
      throw new UnauthorizedException(
        'Chỉ quản trị viên cấp cao (SUPER_ADMIN) mới có quyền cập nhật cấu hình cửa hàng',
      );
    }

    const existing = await this.getStoreConfig();

    const targetOrderingEnabled =
      dto.customerOrderingEnabled !== undefined
        ? dto.customerOrderingEnabled
        : existing.customerOrderingEnabled;

    const targetPhone =
      dto.contactPhone !== undefined
        ? dto.contactPhone.trim()
        : existing.contactPhone;

    if (!targetOrderingEnabled && (!targetPhone || targetPhone.length < 9)) {
      throw new BadRequestException(
        'Vui lòng cấu hình số điện thoại hotline liên hệ hợp lệ trước khi tắt đặt hàng trực tuyến',
      );
    }

    const updated = await this.prisma.storeConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.customerOrderingEnabled !== undefined && {
          customerOrderingEnabled: dto.customerOrderingEnabled,
        }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone.trim(),
        }),
      },
    });

    try {
      const published = await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'store-config.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: null,
          payload: {},
        }),
      );
      if (!published) {
        this.logger.warn(
          'Failed to publish store-config.updated event: RabbitMQ unavailable',
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to publish store-config.updated event: ${String(error)}`,
      );
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
      throw new BadRequestException(
        `Ngày "${dateStr}" không tồn tại trên lịch`,
      );
    }

    // Vietnam is UTC+7 (Indochina Time).
    // Start of day in VN (00:00:00.000 +07:00) is equivalent to 17:00:00.000 UTC of previous day.
    // End of day in VN (23:59:59.999 +07:00) is equivalent to 16:59:59.999 UTC of current day.
    if (isEndOfDay) {
      return new Date(Date.UTC(year, month - 1, day, 23 - 7, 59, 59, 999));
    }
    return new Date(Date.UTC(year, month - 1, day, 0 - 7, 0, 0, 0));
  }

  async getOrders(
    params?: {
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      branchId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
    user?: RequestUser,
  ) {
    if (
      params?.startDate &&
      params?.endDate &&
      params.startDate > params.endDate
    ) {
      throw new BadRequestException('startDate không thể lớn hơn endDate');
    }

    let effectiveBranchId = params?.branchId;
    if (user && user.role !== 'SUPER_ADMIN') {
      if (!user.branchId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
        );
      }
      effectiveBranchId = user.branchId;
    }

    const DEFAULT_ORDERS_LIMIT = 50;
    const MAX_ORDERS_LIMIT = 200;
    const page = params?.page ? Math.max(1, Number(params.page)) : 1;
    const limit = params?.limit
      ? Math.min(Math.max(1, Number(params.limit)), MAX_ORDERS_LIMIT)
      : DEFAULT_ORDERS_LIMIT;
    const skip = (page - 1) * limit;

    const createdAtFilter: Record<string, Date> = {};
    if (params?.startDate) {
      createdAtFilter.gte = this.parseVietnamDateBoundary(
        params.startDate,
        false,
      );
    }
    if (params?.endDate) {
      createdAtFilter.lte = this.parseVietnamDateBoundary(params.endDate, true);
    }

    const where: Prisma.OrderWhereInput = {
      status: params?.status,
      paymentStatus: params?.paymentStatus,
      branchId: effectiveBranchId,
      ...(Object.keys(createdAtFilter).length > 0
        ? { createdAt: createdAtFilter }
        : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          items: true,
          statusHistories: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      typeof this.prisma.order.count === 'function'
        ? this.prisma.order.count({ where })
        : Promise.resolve(undefined),
    ]);

    const items = orders.map((order) => this.sanitizeOrder(order));
    return {
      items,
      page,
      limit,
      total: total ?? items.length,
    };
  }
}
