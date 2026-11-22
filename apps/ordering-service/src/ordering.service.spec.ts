import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderingService } from './ordering.service';
import { PrismaService } from './prisma.service';
import { ShippingService } from './shipping/shipping.service';
import { RabbitMQService } from '@common/rabbitmq';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';

describe('OrderingService - createOrder', () => {
  let service: OrderingService;
  let prisma: PrismaService;
  let rabbitmqService: RabbitMQService;
  let shippingService: ShippingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderingService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            product: {
              findMany: jest.fn(),
            },
            orderStatusHistory: {
              create: jest.fn(),
            },
            branch: {
              findUnique: jest.fn(),
            },
            recipe: {
              findUnique: jest.fn(),
            },
            warehouseStock: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            inventoryTransaction: {
              create: jest.fn(),
            },
            orderRecipeDeduction: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            paymentConfig: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            storeConfig: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishEvent: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-tracking-ticket'),
          },
        },
        {
          provide: ShippingService,
          useValue: {
            calculateShipping: jest.fn().mockResolvedValue({
              district: 'Quận 1',
              ward: 'Phường Bến Nghé',
              fee: 20000,
              branch: {
                id: '00000000-0000-0000-0000-000000000001',
                name: 'Chi nhánh 1',
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OrderingService>(OrderingService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
    shippingService = module.get<ShippingService>(ShippingService);

    jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
      id: 'cfg-default',
      key: 'DEFAULT',
      customerOrderingEnabled: true,
      contactPhone: '0988888888',
      heroBanners: null,
      brandStory: null,
      curatedCategories: null,
      culinaryNews: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  it('should throw BadRequestException if items array is empty', async () => {
    await expect(
      service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        items: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a delivery order without a district before reading products', async () => {
    await expect(
      service.createOrder({
        customerName: 'A',
        customerPhone: '0901234567',
        address: '12 Main St',
        district: '',
        ward: 'Phường 1',
        items: [
          { productId: '00000000-0000-0000-0000-000000000001', quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if product is not found or inactive', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([]);

    await expect(
      service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        items: [{ productId: 'uuid-missing', quantity: 2 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return opaque confirmation with order=null when matching idempotencyKey is reused on public createOrder', async () => {
    const existingOrder = {
      id: 'uuid-order-existing',
      code: 'ORD-20261025-0001',
      branchId: 'branch-1',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      customerEmail: 'a@example.com',
      address: '123 Le Loi',
      province: 'TP. Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      note: 'Ít cay',
      paymentMethod: 'VIETQR',
      source: 'STOREFRONT',
      idempotencyKey: 'key-123',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      shippingFee: 15000 as any,
      totalAmount: 100000 as any,
      accessTokenHash: 'secret-hash',
      createdAt: new Date('2026-10-25T10:00:00Z'),
      items: [{ productId: 'uuid-1', quantity: 1 }],
      statusHistories: [{ id: 'hist-1', toStatus: OrderStatus.PENDING }],
    };

    jest
      .spyOn(prisma.order, 'findUnique')
      .mockResolvedValue(existingOrder as any);

    const result = await service.createOrder({
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      customerEmail: 'a@example.com',
      address: '123 Le Loi',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      note: 'Ít cay',
      paymentMethod: 'VIETQR',
      branchId: 'branch-1',
      idempotencyKey: 'key-123',
      items: [{ productId: 'uuid-1', quantity: 1 }],
    });

    expect(result).toEqual({
      order: null,
      trackingToken: null,
      isDuplicate: true,
      message: expect.stringContaining('đã được tiếp nhận'),
    });
    expect(JSON.stringify(result)).not.toContain('ORD-20261025-0001');
    expect(JSON.stringify(result)).not.toContain('uuid-order-existing');
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });

  it('should reject public idempotency retry with ConflictException when phone, items, address, paymentMethod, customerName, or branchId differ', async () => {
    const existingOrder = {
      id: 'uuid-order-existing',
      code: 'ORD-20261025-0001',
      branchId: 'branch-1',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      address: '123 Le Loi',
      province: 'TP. Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      paymentMethod: 'CASH',
      source: 'STOREFRONT',
      idempotencyKey: 'key-123',
      items: [{ productId: 'uuid-1', quantity: 1 }],
    };

    jest
      .spyOn(prisma.order, 'findUnique')
      .mockResolvedValue(existingOrder as any);

    const baseDto = {
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      address: '123 Le Loi',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      paymentMethod: 'CASH',
      branchId: 'branch-1',
      idempotencyKey: 'key-123',
      items: [{ productId: 'uuid-1', quantity: 1 }],
    };

    await expect(
      service.createOrder({ ...baseDto, customerPhone: '0999999999' }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );

    await expect(
      service.createOrder({
        ...baseDto,
        items: [{ productId: 'uuid-other', quantity: 2 }],
      }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );

    await expect(
      service.createOrder({ ...baseDto, address: '999 Nguyen Hue' }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );

    await expect(
      service.createOrder({ ...baseDto, paymentMethod: 'VIETQR' }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );

    await expect(
      service.createOrder({ ...baseDto, customerName: 'Khach Khac' }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );

    await expect(
      service.createOrder({ ...baseDto, branchId: 'branch-2' }),
    ).rejects.toThrow(
      'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
    );
  });

  it('should calculate price from catalog, snapshot product name/price, and generate secret tracking token', async () => {
    const mockProducts = [
      {
        id: 'uuid-prod-1',
        name: 'Sake Nigiri',
        sellingPrice: 45000 as any,
        isActive: true,
      },
      {
        id: 'uuid-prod-2',
        name: 'Maguro Sashimi',
        sellingPrice: 120000 as any,
        isActive: true,
      },
    ];

    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    jest
      .spyOn(prisma.product, 'findMany')
      .mockResolvedValue(mockProducts as any);

    const createdOrder = {
      id: 'uuid-order-1',
      code: 'ORD-20261025-1024',
      branchId: '00000000-0000-0000-0000-000000000001',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      totalAmount: 210000 as any, // 45000 * 2 + 120000 * 1
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      items: [
        {
          id: 'item-1',
          productId: 'uuid-prod-1',
          productName: 'Sake Nigiri',
          unitPrice: 45000 as any,
          quantity: 2,
          subtotal: 90000 as any,
        },
        {
          id: 'item-2',
          productId: 'uuid-prod-2',
          productName: 'Maguro Sashimi',
          unitPrice: 120000 as any,
          quantity: 1,
          subtotal: 120000 as any,
        },
      ],
    };

    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        order: {
          create: jest.fn().mockResolvedValue(createdOrder),
        },
        orderStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        },
      });
    });

    const result = await service.createOrder({
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      address: '123 Le Loi',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      items: [
        { productId: 'uuid-prod-1', quantity: 2 },
        { productId: 'uuid-prod-2', quantity: 1 },
      ],
    });

    expect(result.order).toEqual(createdOrder);
    expect(result.trackingToken).toBeDefined();
    expect(typeof result.trackingToken).toBe('string');
    expect(result.trackingToken?.length).toBeGreaterThanOrEqual(32);
    expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order.created',
        resource: 'order',
        action: 'CREATED',
      }),
    );
  });

  describe('trackOrder', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);

      await expect(
        service.trackOrder('ORD-NOT-FOUND', 'any-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if secret token hash does not match', async () => {
      const order = {
        id: 'ord-1',
        code: 'ORD-20261025-1111',
        accessTokenHash: createHash('sha256')
          .update('real-token')
          .digest('hex'),
        items: [],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);

      await expect(
        service.trackOrder('ORD-20261025-1111', 'wrong-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return sanitized order details when code and token match', async () => {
      const token = 'correct-secret-token-123';
      const accessTokenHash = createHash('sha256').update(token).digest('hex');

      const mockOrder = {
        id: 'ord-1',
        code: 'ORD-20261025-1111',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        totalAmount: 150000,
        accessTokenHash,
        items: [
          {
            id: 'item-1',
            productName: 'Sake Sushi',
            unitPrice: 50000,
            quantity: 3,
            subtotal: 150000,
          },
        ],
        statusHistories: [
          {
            fromStatus: null,
            toStatus: 'PENDING',
            createdAt: new Date(),
          },
        ],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(mockOrder as any);

      const result = await service.trackOrder('ORD-20261025-1111', token);

      expect(result.code).toBe('ORD-20261025-1111');
      expect(result.status).toBe('PENDING');
      expect(result.items.length).toBe(1);
      expect(result.canCancel).toBe(true);
      expect(result.trackingTicket).toBe('mock-jwt-tracking-ticket');
      // Access token hash must NOT be returned in tracking result
      expect((result as any).accessTokenHash).toBeUndefined();
    });

    it('should return order when tracking with matching customer phone without trackingTicket', async () => {
      const mockOrder = {
        id: 'ord-phone-1',
        code: 'ORD-PHONE-01',
        customerPhone: '0901234567',
        status: 'PENDING',
        accessTokenHash: 'some-hash',
        items: [],
        statusHistories: [],
      };
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(mockOrder as any);

      const result = await service.trackOrder(
        'ORD-PHONE-01',
        undefined,
        '090 123 4567',
      );
      expect(result.code).toBe('ORD-PHONE-01');
      expect(result.canCancel).toBe(false);
      expect(result.trackingTicket).toBeUndefined();
      expect((result as any).accessTokenHash).toBeUndefined();
    });

    it('should throw UnauthorizedException when phone does not match', async () => {
      const mockOrder = {
        id: 'ord-phone-1',
        code: 'ORD-PHONE-01',
        customerPhone: '0901234567',
        accessTokenHash: 'some-hash',
        items: [],
      };
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(mockOrder as any);

      await expect(
        service.trackOrder('ORD-PHONE-01', undefined, '0988888888'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateOrderStatus & cancelOrderByCustomer', () => {
    it('should allow customer to cancel order when status is PENDING', async () => {
      const token = 'token-cancel-1';
      const order = {
        id: 'ord-pending',
        code: 'ORD-PENDING-01',
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
        accessTokenHash: createHash('sha256').update(token).digest('hex'),
      };

      const updatedOrder = {
        ...order,
        status: OrderStatus.CANCELLED,
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            update: jest.fn().mockResolvedValue(updatedOrder),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-cancel' }),
          },
        });
      });

      const result = await service.cancelOrderByCustomer(
        'ORD-PENDING-01',
        token,
        'Doi y khong muon an nua',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.status.updated',
          payload: expect.objectContaining({
            status: OrderStatus.CANCELLED,
          }),
        }),
      );
    });

    it('should reject customer cancellation if order is already PREPARING', async () => {
      const token = 'token-cancel-2';
      const order = {
        id: 'ord-prep',
        code: 'ORD-PREPARING-01',
        status: OrderStatus.PREPARING,
        accessTokenHash: createHash('sha256').update(token).digest('hex'),
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);

      await expect(
        service.cancelOrderByCustomer('ORD-PREPARING-01', token),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update order status by staff and record audit history', async () => {
      const order = {
        id: 'ord-staff-1',
        code: 'ORD-STAFF-01',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
      };

      const updatedOrder = {
        ...order,
        status: OrderStatus.CONFIRMED,
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            update: jest.fn().mockResolvedValue(updatedOrder),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-staff' }),
          },
        });
      });

      const result = await service.updateOrderStatus(
        'ord-staff-1',
        OrderStatus.CONFIRMED,
        'Xac nhan don hang',
        'STAFF_01',
      );

      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should reject transitioning to PREPARING if current status is PENDING (must be CONFIRMED first)', async () => {
      const order = {
        id: 'ord-pending-1',
        code: 'ORD-PENDING-01',
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);

      await expect(
        service.updateOrderStatus('ord-pending-1', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transitioning to READY_FOR_PICKUP from PENDING or CONFIRMED (must be PREPARING first to prevent bypassing stock deduction)', async () => {
      const kitchenUser = {
        sub: 'kitchen-1',
        email: 'kitchen@hanbisushi.vn',
        role: 'KITCHEN_STAFF',
        branchId: 'branch-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'ord-pending-ready',
        code: 'ORD-PR-1',
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-pending-ready',
          OrderStatus.READY_FOR_PICKUP,
          'Bếp báo xong tắt',
          'KITCHEN_STAFF',
          kitchenUser,
        ),
      ).rejects.toThrow(BadRequestException);

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'ord-confirmed-ready',
        code: 'ORD-CR-1',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-confirmed-ready',
          OrderStatus.READY_FOR_PICKUP,
          'Bếp báo xong bỏ qua chế biến',
          'KITCHEN_STAFF',
          kitchenUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow KITCHEN_STAFF to transition from PREPARING to READY_FOR_PICKUP', async () => {
      const kitchenUser = {
        sub: 'kitchen-1',
        email: 'kitchen@hanbisushi.vn',
        role: 'KITCHEN_STAFF',
        branchId: 'branch-1',
      };
      const order = {
        id: 'ord-preparing-ready',
        code: 'ORD-PREP-1',
        status: OrderStatus.PREPARING,
        branchId: 'branch-1',
        items: [],
      };
      const updatedOrder = {
        ...order,
        status: OrderStatus.READY_FOR_PICKUP,
        accessTokenHash: 'secret-hash',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            findUnique: jest.fn().mockResolvedValue(order),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue(updatedOrder),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-ready' }),
          },
        });
      });

      const result = await service.updateOrderStatus(
        'ord-preparing-ready',
        OrderStatus.READY_FOR_PICKUP,
        'Đã chế biến xong',
        'KITCHEN_STAFF',
        kitchenUser,
      );

      expect(result.status).toBe(OrderStatus.READY_FOR_PICKUP);
    });

    it('should reject transitioning to PREPARING if branch has no warehouse assigned', async () => {
      const order = {
        id: 'ord-conf-1',
        code: 'ORD-CONF-01',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-no-wh',
        items: [{ productId: 'prod-1', productName: 'Salmon', quantity: 1 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-no-wh',
        warehouseId: null,
      } as any);

      await expect(
        service.updateOrderStatus('ord-conf-1', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transitioning to PREPARING if any product is missing recipe', async () => {
      const order = {
        id: 'ord-conf-2',
        code: 'ORD-CONF-02',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [
          {
            productId: 'prod-no-recipe',
            productName: 'Tuna Roll',
            quantity: 2,
          },
        ],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-no-recipe', name: 'Tuna Roll', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue(null);

      await expect(
        service.updateOrderStatus('ord-conf-2', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transitioning to PREPARING if warehouse stock is insufficient', async () => {
      const order = {
        id: 'ord-conf-3',
        code: 'ORD-CONF-03',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [
          { productId: 'prod-1', productName: 'Salmon Nigiri', quantity: 2 },
        ],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-1', name: 'Salmon Nigiri', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-salmon',
            quantity: 50 as any,
            ingredient: { name: 'Cá hồi', unit: 'g' },
          },
        ],
      } as any);

      jest.spyOn(prisma.warehouseStock, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        warehouseId: 'wh-1',
        ingredientId: 'ing-salmon',
        currentStock: 40 as any,
      } as any);

      await expect(
        service.updateOrderStatus('ord-conf-3', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transitioning if order was already deducted concurrently', async () => {
      const order = {
        id: 'ord-conf-ded',
        code: 'ORD-CONF-DED',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [{ productId: 'prod-1', productName: 'Salmon', quantity: 1 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-1', name: 'Salmon', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-1',
            quantity: 10 as any,
            ingredient: { name: 'Cá hồi', unit: 'g' },
          },
        ],
      } as any);
      jest.spyOn(prisma.warehouseStock, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        warehouseId: 'wh-1',
        ingredientId: 'ing-1',
        currentStock: 100 as any,
      } as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            findUnique: jest.fn().mockResolvedValue(order),
          },
          orderRecipeDeduction: {
            findUnique: jest.fn().mockResolvedValue({ id: 'existing-ded' }),
          },
        });
      });

      await expect(
        service.updateOrderStatus('ord-conf-ded', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transitioning if order status changed concurrently during processing', async () => {
      const order = {
        id: 'ord-conf-race',
        code: 'ORD-CONF-RACE',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [{ productId: 'prod-1', productName: 'Salmon', quantity: 1 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-1', name: 'Salmon', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-1',
            quantity: 10 as any,
            ingredient: { name: 'Cá hồi', unit: 'g' },
          },
        ],
      } as any);
      jest.spyOn(prisma.warehouseStock, 'findUnique').mockResolvedValue({
        id: 'ws-1',
        warehouseId: 'wh-1',
        ingredientId: 'ing-1',
        currentStock: 100 as any,
      } as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ ...order, status: OrderStatus.CANCELLED }),
          },
        });
      });

      await expect(
        service.updateOrderStatus('ord-conf-race', OrderStatus.PREPARING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deduct warehouse stock and update order to PREPARING when stock is sufficient', async () => {
      const order = {
        id: 'ord-conf-4',
        code: 'ORD-CONF-04',
        status: OrderStatus.CONFIRMED,
        branchId: 'branch-1',
        items: [
          { productId: 'prod-1', productName: 'Salmon Nigiri', quantity: 2 },
        ],
      };

      const updatedOrder = {
        ...order,
        status: OrderStatus.PREPARING,
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-1', name: 'Salmon Nigiri', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-salmon',
            quantity: 50 as any,
            ingredient: { name: 'Cá hồi', unit: 'g' },
          },
        ],
      } as any);

      const mockStock = {
        id: 'ws-1',
        warehouseId: 'wh-1',
        ingredientId: 'ing-salmon',
        currentStock: 500 as any,
      };
      jest
        .spyOn(prisma.warehouseStock, 'findUnique')
        .mockResolvedValue(mockStock as any);

      const updateStockMock = jest
        .fn()
        .mockResolvedValue({ ...mockStock, currentStock: 400 });
      const createTxMock = jest.fn().mockResolvedValue({ id: 'tx-1' });
      const createDeductionMock = jest.fn().mockResolvedValue({ id: 'ded-1' });

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          warehouseStock: {
            findUnique: jest.fn().mockResolvedValue(mockStock),
            update: updateStockMock,
          },
          inventoryTransaction: {
            create: createTxMock,
          },
          orderRecipeDeduction: {
            create: createDeductionMock,
          },
          order: {
            update: jest.fn().mockResolvedValue(updatedOrder),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
          },
        });
      });

      const result = await service.updateOrderStatus(
        'ord-conf-4',
        OrderStatus.PREPARING,
        'Bếp bắt đầu chế biến',
        'CHEF',
      );

      expect(result.status).toBe(OrderStatus.PREPARING);
      expect(updateStockMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentStock: 400 },
        }),
      );
      expect(createDeductionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'ord-conf-4',
            warehouseId: 'wh-1',
          }),
        }),
      );
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.status.updated',
          payload: expect.objectContaining({
            orderId: 'ord-conf-4',
            status: OrderStatus.PREPARING,
          }),
        }),
      );
    });

    it('should lock all ingredients in sorted order before locking warehouse_stocks when transitioning to PREPARING', async () => {
      const order = {
        id: 'ord-lock-order',
        code: 'ORD-LOCK-1',
        branchId: 'branch-1',
        status: OrderStatus.CONFIRMED,
        paymentMethod: 'CASH',
        paymentStatus: PaymentStatus.UNPAID,
        items: [{ productId: 'prod-1', productName: 'Combo', quantity: 1 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'findMany')
        .mockResolvedValue([
          { id: 'prod-1', name: 'Salmon Nigiri', type: 'SINGLE' } as any,
        ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValue({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-b',
            quantity: 20 as any,
            ingredient: { name: 'Gạo', unit: 'g' },
          },
          {
            ingredientId: 'ing-a',
            quantity: 50 as any,
            ingredient: { name: 'Cá hồi', unit: 'g' },
          },
        ],
      } as any);

      jest.spyOn(prisma.warehouseStock, 'findUnique').mockResolvedValue({
        id: 'ws-any',
        currentStock: 500 as any,
      } as any);

      const lockCalls: string[] = [];
      const txQueryRaw = jest
        .fn()
        .mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            if (sql.includes('inventory.ingredients')) {
              lockCalls.push(`ingredients:${String(values[0])}`);
              return Promise.resolve([{ id: String(values[0]) }]);
            }
            if (sql.includes('inventory.warehouse_stocks')) {
              lockCalls.push(`warehouse_stocks:${String(values[1])}`);
              return Promise.resolve([{ id: 'ws-1', currentStock: 500 }]);
            }
            return Promise.resolve([]);
          },
        );

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          $queryRaw: txQueryRaw,
          warehouseStock: {
            findUnique: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
          },
          ingredient: {
            update: jest.fn().mockResolvedValue({}),
          },
          inventoryTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
          },
          orderRecipeDeduction: {
            create: jest.fn().mockResolvedValue({ id: 'ded-1' }),
          },
          order: {
            update: jest
              .fn()
              .mockResolvedValue({ ...order, status: OrderStatus.PREPARING }),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
          },
        });
      });

      await service.updateOrderStatus(
        'ord-lock-order',
        OrderStatus.PREPARING,
        'Bếp chế biến',
        'KITCHEN_STAFF',
      );

      expect(lockCalls).toEqual([
        'ingredients:ing-a',
        'ingredients:ing-b',
        'warehouse_stocks:ing-a',
        'warehouse_stocks:ing-b',
      ]);
    });

    it('should update payment status to PAID by cashier', async () => {
      const order = {
        id: 'ord-pay-1',
        code: 'ORD-PAY-01',
        paymentStatus: PaymentStatus.UNPAID,
        branchId: 'branch-1',
      };

      const updatedOrder = {
        ...order,
        paymentStatus: PaymentStatus.PAID,
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(updatedOrder as any);

      const result = await service.updatePaymentStatus(
        'ord-pay-1',
        PaymentStatus.PAID,
      );

      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.payment.updated',
        }),
      );
    });
  });

  describe('OrderingService - getOrders', () => {
    it('should query orders without date filter when none provided and return paginated envelope', async () => {
      const mockOrders = [{ id: 'order-1', code: 'ORD-1' }];
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(1);

      const result = await service.getOrders({
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
      });

      expect(result).toEqual({
        items: mockOrders,
        page: 1,
        limit: 50,
        total: 1,
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.PENDING,
          paymentStatus: undefined,
          branchId: 'branch-1',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
        include: {
          items: true,
          statusHistories: { orderBy: { createdAt: 'asc' } },
        },
      });
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.PENDING,
          paymentStatus: undefined,
          branchId: 'branch-1',
        },
      });
    });

    it('should calculate Vietnam timezone start-of-day boundary for startDate', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(0);

      await service.getOrders({ startDate: '2026-11-04' });

      // 00:00:00 ICT on 2026-11-04 is 17:00:00 UTC on 2026-11-03
      const expectedStart = new Date(Date.UTC(2026, 10, 3, 17, 0, 0, 0));

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: expectedStart },
          }),
        }),
      );
    });

    it('should calculate Vietnam timezone end-of-day boundary for endDate', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(0);

      await service.getOrders({ endDate: '2026-11-04' });

      // 23:59:59.999 ICT on 2026-11-04 is 16:59:59.999 UTC on 2026-11-04
      const expectedEnd = new Date(Date.UTC(2026, 10, 4, 16, 59, 59, 999));

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: expectedEnd },
          }),
        }),
      );
    });

    it('should filter with both startDate and endDate boundaries', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(0);

      await service.getOrders({
        startDate: '2026-11-01',
        endDate: '2026-11-04',
      });

      const expectedStart = new Date(Date.UTC(2026, 10, 1 - 1, 17, 0, 0, 0)); // 2026-10-31T17:00:00.000Z
      const expectedEnd = new Date(Date.UTC(2026, 10, 4, 16, 59, 59, 999)); // 2026-11-04T16:59:59.999Z

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expectedStart,
              lte: expectedEnd,
            },
          }),
        }),
      );
    });

    it('should throw BadRequestException if startDate is after endDate', async () => {
      await expect(
        service.getOrders({
          startDate: '2026-11-10',
          endDate: '2026-11-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date string format', async () => {
      await expect(
        service.getOrders({ startDate: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-existent calendar date (e.g. Feb 30)', async () => {
      await expect(
        service.getOrders({ startDate: '2026-02-30' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply default page=1 and limit=50 when pagination params are omitted', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(0);

      const res = await service.getOrders();

      expect(res).toEqual({
        items: [],
        page: 1,
        limit: 50,
        total: 0,
      });
      const findManyArg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArg.skip).toBe(0);
      expect(findManyArg.take).toBe(50);
      expect(findManyArg.orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('should calculate skip using default limit=50 when page is provided', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(120);

      const res = await service.getOrders({ page: 2 });

      expect(res).toEqual({
        items: [],
        page: 2,
        limit: 50,
        total: 120,
      });
      const firstCallArg = (prisma.order.findMany as jest.Mock).mock
        .calls[0][0];
      expect(firstCallArg.skip).toBe(50);
      expect(firstCallArg.take).toBe(50);

      await service.getOrders({ page: 3, limit: 25 });

      expect(prisma.order.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 25,
        }),
      );
    });

    it('should cap limit at 200 when caller requests larger limit', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(500);

      const res = await service.getOrders({ page: 2, limit: 500 });

      expect(res.limit).toBe(200);
      expect(res.total).toBe(500);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 200,
          take: 200,
        }),
      );
    });
  });

  describe('OrderingService - Bank Transfer Gating', () => {
    it('should block moving VIETQR order to CONFIRMED when UNPAID', async () => {
      const order = {
        id: 'ord-unpaid-qr',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: 'VIETQR',
        items: [],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);

      await expect(
        service.updateOrderStatus('ord-unpaid-qr', OrderStatus.CONFIRMED),
      ).rejects.toThrow(
        'Đơn hàng thanh toán chuyển khoản cần được xác nhận thanh toán (Đã thanh toán) trước khi duyệt đơn hoặc chế biến!',
      );
    });
  });

  describe('OrderingService - PaymentConfig', () => {
    it('should return existing payment config if present', async () => {
      const mockConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        bankName: 'MB Bank',
        accountNumber: '123456789',
        accountHolder: 'SUSHI TEST',
        qrImageUrl: 'https://example.com/qr.png',
        transferSyntax: 'HANBI',
        isActive: true,
      };

      jest
        .spyOn(prisma.paymentConfig, 'findUnique')
        .mockResolvedValue(mockConfig as any);

      const result = await service.getPaymentConfig();
      expect(result).toEqual(mockConfig);
    });

    it('should create default payment config if not found', async () => {
      jest.spyOn(prisma.paymentConfig, 'findUnique').mockResolvedValue(null);
      const createdConfig = {
        id: 'cfg-new',
        key: 'DEFAULT',
        bankName: 'MB Bank (Ngân hàng Quân Đội)',
        accountNumber: '0988888888',
        accountHolder: 'HANBI SUSHI PLATFORM',
        qrImageUrl: null,
        transferSyntax: 'HANBI',
        isActive: true,
      };
      jest
        .spyOn(prisma.paymentConfig, 'create')
        .mockResolvedValue(createdConfig as any);

      const result = await service.getPaymentConfig();
      expect(result).toEqual(createdConfig);
    });

    it('should update payment config with provided fields', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        bankName: 'Old Bank',
      };
      jest
        .spyOn(prisma.paymentConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      jest.spyOn(prisma.paymentConfig, 'update').mockResolvedValue({
        ...existingConfig,
        bankName: 'New Bank',
        qrImageUrl: 'https://cloudinary.com/new-qr.png',
      } as any);

      const result = await service.updatePaymentConfig({
        bankName: 'New Bank',
        qrImageUrl: 'https://cloudinary.com/new-qr.png',
      });

      expect(result.bankName).toBe('New Bank');
      expect(prisma.paymentConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cfg-1' },
          data: expect.objectContaining({
            bankName: 'New Bank',
            qrImageUrl: 'https://cloudinary.com/new-qr.png',
          }),
        }),
      );
    });
  });

  describe('OrderingService - StoreConfig & Ordering Mode Gating', () => {
    it('should return existing store config if present', async () => {
      const mockConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: false,
        contactPhone: '0912345678',
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(mockConfig as any);

      const result = await service.getStoreConfig();
      expect(result).toEqual(mockConfig);
    });

    it('should create default store config if not found', async () => {
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue(null);
      const createdConfig = {
        id: 'cfg-new',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      };
      jest
        .spyOn(prisma.storeConfig, 'create')
        .mockResolvedValue(createdConfig as any);

      const result = await service.getStoreConfig();
      expect(result).toEqual(createdConfig);
    });

    it('should reject updating store config if user role is not SUPER_ADMIN', async () => {
      await expect(
        service.updateStoreConfig(
          { customerOrderingEnabled: false },
          'CASHIER',
        ),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.updateStoreConfig(
          { customerOrderingEnabled: false },
          undefined,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject disabling customer ordering if phone is missing or invalid', async () => {
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '',
      } as any);

      await expect(
        service.updateStoreConfig(
          { customerOrderingEnabled: false, contactPhone: '' },
          'SUPER_ADMIN',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update store config when super admin provides valid data', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      jest.spyOn(prisma.storeConfig, 'update').mockResolvedValue({
        ...existingConfig,
        customerOrderingEnabled: false,
        contactPhone: '0911223344',
      } as any);

      const result = await service.updateStoreConfig(
        { customerOrderingEnabled: false, contactPhone: '0911223344' },
        'SUPER_ADMIN',
      );

      expect(result.customerOrderingEnabled).toBe(false);
      expect(result.contactPhone).toBe('0911223344');
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'store-config.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: null,
          payload: {},
        }),
      );
    });

    it('should normalize and persist custom heroBanners when super admin updates banners', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
        heroBanners: null,
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      const updateSpy = jest
        .spyOn(prisma.storeConfig, 'update')
        .mockResolvedValue({
          ...existingConfig,
          heroBanners: [
            {
              id: 'slide-1',
              imageUrl:
                'https://res.cloudinary.com/demo/image/upload/banner1.webp',
              leadTitle: 'Ưu đãi đặc biệt',
              highlightTitle: 'Sashimi Cá Hồi Na Uy',
              description: 'Giảm 15% cho đơn đặt trực tuyến',
              kanjiWatermark: '新鮮 極上 刺身',
              isActive: true,
            },
          ],
        } as any);

      const result = await service.updateStoreConfig(
        {
          heroBanners: [
            {
              id: ' slide-1 ',
              imageUrl: ' https://res.cloudinary.com/demo/image/upload/banner1.webp ',
              leadTitle: ' Ưu đãi đặc biệt ',
              highlightTitle: ' Sashimi Cá Hồi Na Uy ',
              description: ' Giảm 15% cho đơn đặt trực tuyến ',
              kanjiWatermark: ' 新鮮 極上 刺身 ',
              isActive: true,
            },
          ],
        },
        'SUPER_ADMIN',
      );

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'cfg-1' },
        data: {
          heroBanners: [
            {
              id: 'slide-1',
              imageUrl: 'https://res.cloudinary.com/demo/image/upload/banner1.webp',
              leadTitle: 'Ưu đãi đặc biệt',
              highlightTitle: 'Sashimi Cá Hồi Na Uy',
              description: 'Giảm 15% cho đơn đặt trực tuyến',
              kanjiWatermark: '新鮮 極上 刺身',
              isActive: true,
            },
          ],
        },
      });
      expect(result.heroBanners).toHaveLength(1);
    });

    it('should normalize and persist curatedCategories and culinaryNews when super admin updates homepage sections', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
        heroBanners: null,
        curatedCategories: null,
        culinaryNews: null,
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      const updateSpy = jest
        .spyOn(prisma.storeConfig, 'update')
        .mockResolvedValue({
          ...existingConfig,
          curatedCategories: [
            {
              id: 'sashimi',
              title: 'SASHIMI',
              japanese: '刺身',
              desc: 'Hải sản tươi sống',
              imageUrl: 'https://res.cloudinary.com/demo/image/upload/cat1.webp',
              targetCategory: 'sashimi',
              isActive: true,
            },
          ],
          culinaryNews: [
            {
              id: 'news-1',
              title: 'Ưu đãi mùa thu',
              date: '21.11.2026',
              tag: 'Khuyến mãi',
              imageUrl: 'https://res.cloudinary.com/demo/image/upload/news1.webp',
              summary: 'Giảm 20% tất cả combo',
              isActive: true,
            },
          ],
        } as any);

      const result = await service.updateStoreConfig(
        {
          curatedCategories: [
            {
              id: ' sashimi ',
              title: ' SASHIMI ',
              japanese: ' 刺身 ',
              desc: ' Hải sản tươi sống ',
              imageUrl: ' https://res.cloudinary.com/demo/image/upload/cat1.webp ',
              targetCategory: ' sashimi ',
              isActive: true,
            },
          ],
          culinaryNews: [
            {
              id: ' news-1 ',
              title: ' Ưu đãi mùa thu ',
              date: ' 21.11.2026 ',
              tag: ' Khuyến mãi ',
              imageUrl: ' https://res.cloudinary.com/demo/image/upload/news1.webp ',
              summary: ' Giảm 20% tất cả combo ',
              isActive: true,
            },
          ],
        },
        'SUPER_ADMIN',
      );

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'cfg-1' },
        data: {
          curatedCategories: [
            {
              id: 'sashimi',
              title: 'SASHIMI',
              japanese: '刺身',
              desc: 'Hải sản tươi sống',
              imageUrl: 'https://res.cloudinary.com/demo/image/upload/cat1.webp',
              targetCategory: 'sashimi',
              isActive: true,
            },
          ],
          culinaryNews: [
            {
              id: 'news-1',
              title: 'Ưu đãi mùa thu',
              date: '21.11.2026',
              tag: 'Khuyến mãi',
              imageUrl: 'https://res.cloudinary.com/demo/image/upload/news1.webp',
              summary: 'Giảm 20% tất cả combo',
              isActive: true,
            },
          ],
        },
      });
      expect((result as any).curatedCategories).toHaveLength(1);
      expect((result as any).culinaryNews).toHaveLength(1);
    });

    it('should normalize and persist footerConfig with Japanese pattern preset when super admin updates footer', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
        heroBanners: null,
        curatedCategories: null,
        culinaryNews: null,
        footerConfig: null,
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      const updateSpy = jest
        .spyOn(prisma.storeConfig, 'update')
        .mockResolvedValue({
          ...existingConfig,
          footerConfig: {
            patternPreset: 'asanoha',
            customBgImageUrl: '',
            bgColor: '#0f141c',
            overlayOpacity: 85,
            patternOpacity: 25,
            brandDescription: 'Sushi chuẩn vị Nhật Bản',
            openingDays: 'Thứ Hai - Chủ Nhật',
            openingHours: '10:00 - 22:00 hàng ngày',
            closingNote: '(Nhận đơn giao hàng đến 21:30)',
            addressNote: 'Giao hàng tận nơi TP.HCM',
            copyrightText: '© 2026 HANBI SUSHI Platform. All rights reserved.',
          },
        } as any);

      const result = await service.updateStoreConfig(
        {
          footerConfig: {
            patternPreset: ' asanoha ',
            customBgImageUrl: ' ',
            bgColor: ' #0f141c ',
            overlayOpacity: 85,
            patternOpacity: 25,
            brandDescription: ' Sushi chuẩn vị Nhật Bản ',
            openingDays: ' Thứ Hai - Chủ Nhật ',
            openingHours: ' 10:00 - 22:00 hàng ngày ',
            closingNote: ' (Nhận đơn giao hàng đến 21:30) ',
            addressNote: ' Giao hàng tận nơi TP.HCM ',
            copyrightText: ' © 2026 HANBI SUSHI Platform. All rights reserved. ',
          },
        },
        'SUPER_ADMIN',
      );

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'cfg-1' },
        data: {
          footerConfig: {
            patternPreset: 'asanoha',
            customBgImageUrl: '',
            bgColor: '#0f141c',
            overlayOpacity: 85,
            patternOpacity: 25,
            brandDescription: 'Sushi chuẩn vị Nhật Bản',
            openingDays: 'Thứ Hai - Chủ Nhật',
            openingHours: '10:00 - 22:00 hàng ngày',
            closingNote: '(Nhận đơn giao hàng đến 21:30)',
            addressNote: 'Giao hàng tận nơi TP.HCM',
            copyrightText: '© 2026 HANBI SUSHI Platform. All rights reserved.',
          },
        },
      });
      expect((result as any).footerConfig.patternPreset).toBe('asanoha');
    });

    it('should return updated config and not throw when rabbitmq publish fails', async () => {
      const existingConfig = {
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      };
      jest
        .spyOn(prisma.storeConfig, 'findUnique')
        .mockResolvedValue(existingConfig as any);
      jest.spyOn(prisma.storeConfig, 'update').mockResolvedValue({
        ...existingConfig,
        customerOrderingEnabled: true,
        contactPhone: '0999888777',
      } as any);
      jest.spyOn(rabbitmqService, 'publishEvent').mockResolvedValue(false);

      const result = await service.updateStoreConfig(
        { customerOrderingEnabled: true, contactPhone: '0999888777' },
        'SUPER_ADMIN',
      );

      expect(result.contactPhone).toBe('0999888777');
    });

    it('should block new customer orders when customerOrderingEnabled is false', async () => {
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: false,
        contactPhone: '0988888888',
      } as any);

      await expect(
        service.createOrder({
          customerName: 'Khach Hang A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Cửa hàng hiện đang tạm ngưng nhận đặt món trực tuyến. Quý khách vui lòng liên hệ hotline để được phục vụ.',
      );
    });

    it('should allow idempotency retry for existing order even when customerOrderingEnabled is false', async () => {
      const existingOrder = {
        id: 'ord-existing-1',
        code: 'ORD-EXISTING-1',
        branchId: 'branch-1',
        customerName: 'Khach Hang A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        paymentMethod: 'CASH',
        province: 'TP. Hồ Chí Minh',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-key-123',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        shippingFee: 0,
        totalAmount: 100000,
        createdAt: new Date('2026-10-25T10:00:00Z'),
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(existingOrder as any);
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: false,
        contactPhone: '0988888888',
      } as any);

      const result = await service.createOrder({
        customerName: 'Khach Hang A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: 'branch-1',
        idempotencyKey: 'idem-key-123',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.trackingToken).toBeNull();
      expect(result.order).toBeNull();
    });
  });

  describe('OrderingService - createStaffOrder', () => {
    it('should reject if role is not authorized', async () => {
      await expect(
        service.createStaffOrder({} as any, 'user-1', undefined),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.createStaffOrder({} as any, 'user-1', 'CUSTOMER'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject if branch does not exist or is inactive', async () => {
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue(null);

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach B',
            customerPhone: '0901234567',
            address: '123 Le Loi',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            branchId: '00000000-0000-0000-0000-000000000099',
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          'staff-1',
          'CASHIER',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully create staff order with source=STAFF even if customerOrderingEnabled is false', async () => {
      const branchId = '00000000-0000-0000-0000-000000000001';
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: branchId,
        name: 'Chi nhánh 1',
        isActive: true,
      } as any);

      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-prod-1',
          name: 'Nigiri Cá Hồi',
          sellingPrice: 120000 as any,
          isActive: true,
        } as any,
      ]);

      const createdOrder = {
        id: 'ord-staff-1',
        code: 'ORD-STAFF-01',
        branchId,
        customerName: 'Khach B',
        customerPhone: '0901234567',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        source: 'STAFF',
        totalAmount: 140000 as any,
        shippingFee: 20000 as any,
        items: [],
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            create: jest.fn().mockResolvedValue(createdOrder),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-staff-1' }),
          },
        });
      });

      // Even if customer ordering is disabled:
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: false,
        contactPhone: '0988888888',
      } as any);

      const result = await service.createStaffOrder(
        {
          customerName: 'Khach B',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          branchId,
          items: [{ productId: 'uuid-prod-1', quantity: 1 }],
        },
        'staff-user-id',
        'CASHIER',
      );

      expect(result.order.source).toBe('STAFF');
      expect(result.order.status).toBe(OrderStatus.PENDING);
      expect((result.order as any).accessTokenHash).toBeUndefined();
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.created',
          payload: expect.objectContaining({
            source: 'STAFF',
          }),
        }),
      );
    });

    it('should reject staff order if staff branch does not match target branchId', async () => {
      const user = {
        sub: 'staff-1',
        email: 'staff@example.com',
        role: 'CASHIER',
        branchId: '00000000-0000-0000-0000-000000000001',
      };

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach C',
            customerPhone: '0901234567',
            address: '456 Hai Ba Trung',
            district: 'Quận 3',
            ward: 'Phường Võ Thị Sáu',
            branchId: '00000000-0000-0000-0000-000000000002', // different branch
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          user.sub,
          user.role,
          user,
        ),
      ).rejects.toThrow(
        'Bạn chỉ có quyền tạo đơn hàng cho chi nhánh được phân công!',
      );
    });
  });

  describe('OrderingService - Branch Isolation & Sanitization', () => {
    it('should enforce user branchId when querying orders for branch staff', async () => {
      const user = {
        sub: 'staff-1',
        email: 'staff@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-assigned',
      };

      const mockOrdersWithHash = [
        {
          id: 'ord-1',
          code: 'ORD-1',
          branchId: 'branch-uuid-assigned',
          accessTokenHash: 'secret-hash-1',
          items: [],
          statusHistories: [],
        },
      ];
      jest
        .spyOn(prisma.order, 'findMany')
        .mockResolvedValue(mockOrdersWithHash as any);

      const result = await service.getOrders(
        { status: OrderStatus.PENDING },
        user,
      );
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 'branch-uuid-assigned',
          }),
        }),
      );
      expect(result.items[0].id).toBe('ord-1');
      expect((result.items[0] as any).accessTokenHash).toBeUndefined();
    });

    it('should block status update if staff does not belong to the order branch', async () => {
      const user = {
        sub: 'staff-1',
        email: 'staff@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-2',
        branchId: 'branch-uuid-2', // different branch
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-2',
          OrderStatus.CONFIRMED,
          'ok',
          'CASHIER',
          user,
        ),
      ).rejects.toThrow(
        'Bạn chỉ có quyền thao tác trên đơn hàng thuộc chi nhánh của mình!',
      );
    });

    it('should block cashier from moving order to PREPARING status', async () => {
      const user = {
        sub: 'staff-1',
        email: 'staff@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-2',
        branchId: 'branch-uuid-1',
        status: OrderStatus.CONFIRMED,
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-2',
          OrderStatus.PREPARING,
          'cook',
          'CASHIER',
          user,
        ),
      ).rejects.toThrow(
        'Thu ngân chỉ có quyền Xác nhận đơn (CONFIRMED) hoặc Hủy đơn (CANCELLED). Việc chế biến do Bếp đảm nhận!',
      );
    });

    it('should block kitchen staff from cancelling order', async () => {
      const user = {
        sub: 'kitchen-1',
        email: 'kitchen@example.com',
        role: 'KITCHEN_STAFF',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-2',
        branchId: 'branch-uuid-1',
        status: OrderStatus.PENDING,
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-2',
          OrderStatus.CANCELLED,
          'cancel',
          'KITCHEN_STAFF',
          user,
        ),
      ).rejects.toThrow(
        'Nhân viên bếp chỉ có quyền Chế biến (PREPARING) hoặc Chế biến xong (READY_FOR_PICKUP)!',
      );
    });

    it('should block cashier from cancelling order once it is PREPARING or later', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'cashier@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      for (const blockedStatus of [
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.DELIVERING,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]) {
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
          id: `ord-cashier-cancel-${blockedStatus}`,
          code: `ORD-CC-${blockedStatus}`,
          branchId: 'branch-uuid-1',
          status: blockedStatus,
          items: [],
        } as any);

        await expect(
          service.updateOrderStatus(
            `ord-cashier-cancel-${blockedStatus}`,
            OrderStatus.CANCELLED,
            'Hủy đơn trễ',
            'CASHIER',
            cashierUser,
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should block cashier from confirming order when source status is not PENDING', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'cashier@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'ord-cashier-confirm-prep',
        code: 'ORD-CCP-1',
        branchId: 'branch-uuid-1',
        status: OrderStatus.PREPARING,
        items: [],
      } as any);

      await expect(
        service.updateOrderStatus(
          'ord-cashier-confirm-prep',
          OrderStatus.CONFIRMED,
          'Xác nhận lại',
          'CASHIER',
          cashierUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow cashier to cancel order from PENDING or CONFIRMED', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'cashier@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      for (const sourceStatus of [OrderStatus.PENDING, OrderStatus.CONFIRMED]) {
        const order = {
          id: `ord-cashier-ok-${sourceStatus}`,
          code: `ORD-OK-${sourceStatus}`,
          branchId: 'branch-uuid-1',
          status: sourceStatus,
          items: [],
        };
        const updatedOrder = {
          ...order,
          status: OrderStatus.CANCELLED,
          accessTokenHash: 'secret-hash',
        };

        jest
          .spyOn(prisma.order, 'findUnique')
          .mockResolvedValueOnce(order as any);
        jest
          .spyOn(prisma, '$transaction')
          .mockImplementationOnce(async (cb: any) => {
            return cb({
              order: {
                findUnique: jest.fn().mockResolvedValue(order),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                update: jest.fn().mockResolvedValue(updatedOrder),
              },
              orderStatusHistory: {
                create: jest
                  .fn()
                  .mockResolvedValue({ id: `hist-${sourceStatus}` }),
              },
            });
          });

        const result = await service.updateOrderStatus(
          order.id,
          OrderStatus.CANCELLED,
          'Khách yêu cầu hủy',
          'CASHIER',
          cashierUser,
        );

        expect(result.status).toBe(OrderStatus.CANCELLED);
      }
    });

    it('should block kitchen staff from updating payment status', async () => {
      const user = {
        sub: 'kitchen-1',
        email: 'kitchen@example.com',
        role: 'KITCHEN_STAFF',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-3',
        branchId: 'branch-uuid-1',
      } as any);

      await expect(
        service.updatePaymentStatus('ord-3', PaymentStatus.PAID, user),
      ).rejects.toThrow(
        'Chỉ Thu ngân hoặc Quản lý chi nhánh mới có quyền cập nhật trạng thái thanh toán!',
      );
    });

    it('should block payment status update if staff does not belong to the order branch', async () => {
      const user = {
        sub: 'staff-1',
        email: 'staff@example.com',
        role: 'CASHIER',
        branchId: 'branch-uuid-1',
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-3',
        branchId: 'branch-uuid-3', // different branch
      } as any);

      await expect(
        service.updatePaymentStatus('ord-3', PaymentStatus.PAID, user),
      ).rejects.toThrow(
        'Bạn chỉ có quyền thao tác trên đơn hàng thuộc chi nhánh của mình!',
      );
    });

    it('should reject staff order creation if staff account has no assigned branchId', async () => {
      const userWithoutBranch = {
        sub: 'cashier-no-branch',
        email: 'nobranch@example.com',
        role: 'CASHIER',
        branchId: null,
      };

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach D',
            customerPhone: '0901234567',
            address: '123 Nguyen Hue',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            branchId: '00000000-0000-0000-0000-000000000001',
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          userWithoutBranch.sub,
          userWithoutBranch.role,
          userWithoutBranch as any,
        ),
      ).rejects.toThrow(
        'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
      );
    });

    it('should block idempotency reuse across branches for staff orders', async () => {
      const user = {
        sub: 'cashier-1',
        email: 'c1@example.com',
        role: 'CASHIER',
        branchId: 'branch-assigned-1',
      };

      const existingOtherBranchOrder = {
        id: 'ord-other-branch',
        code: 'ORD-OTHER',
        branchId: 'branch-assigned-2', // different branch
        idempotencyKey: 'idem-cross-branch',
        accessTokenHash: 'secret-hash-99',
        items: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(existingOtherBranchOrder as any);

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach E',
            customerPhone: '0901234567',
            address: '123 Le Loi',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            branchId: 'branch-assigned-1',
            idempotencyKey: 'idem-cross-branch',
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          user.sub,
          user.role,
          user,
        ),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) đã được sử dụng cho đơn hàng thuộc chi nhánh khác!',
      );
    });

    it('should not return any order payload or token when customer order is returned via idempotency key', async () => {
      const existingOrder = {
        id: 'ord-customer-idem',
        code: 'ORD-CUST-IDEM',
        branchId: 'branch-1',
        customerName: 'Khach Test',
        customerPhone: '0901234567',
        address: '123 Secret Street',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        paymentMethod: 'CASH',
        province: 'TP. Hồ Chí Minh',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-token-sanitize',
        accessTokenHash: 'super-secret-hash-value',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        shippingFee: 0,
        totalAmount: 50000,
        createdAt: new Date('2026-10-25T10:00:00Z'),
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(existingOrder as any);

      const result = await service.createOrder({
        customerName: 'Khach Test',
        customerPhone: '0901234567',
        address: '123 Secret Street',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: 'branch-1',
        idempotencyKey: 'idem-token-sanitize',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.trackingToken).toBeNull();
      expect(result.order).toBeNull();
    });

    it('should reject staff idempotency retry with ConflictException when payload or branchId differs (including SUPER_ADMIN)', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'c1@example.com',
        role: 'CASHIER',
        branchId: 'branch-assigned-1',
      };

      const superAdminUser = {
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'SUPER_ADMIN',
        branchId: null,
      };

      const existingSameBranchOrder = {
        id: 'ord-same-branch',
        code: 'ORD-SAME',
        branchId: 'branch-assigned-1',
        customerName: 'Khach E',
        customerPhone: '0901112222',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        paymentMethod: 'CASH',
        source: 'STAFF',
        idempotencyKey: 'idem-staff-conflict',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(existingSameBranchOrder as any);

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach E',
            customerPhone: '0909998888',
            address: '123 Le Loi',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            branchId: 'branch-assigned-1',
            idempotencyKey: 'idem-staff-conflict',
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          cashierUser.sub,
          cashierUser.role,
          cashierUser,
        ),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );

      await expect(
        service.createStaffOrder(
          {
            customerName: 'Khach E',
            customerPhone: '0901112222',
            address: '123 Le Loi',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            branchId: 'branch-other-2',
            idempotencyKey: 'idem-staff-conflict',
            items: [{ productId: 'uuid-1', quantity: 1 }],
          },
          superAdminUser.sub,
          superAdminUser.role,
          superAdminUser,
        ),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );
    });

    it('should return duplicate response on P2002 idempotency_key collision during concurrent public createOrder', async () => {
      const existingOrder = {
        id: 'ord-race-1',
        code: 'ORD-RACE-1',
        branchId: '00000000-0000-0000-0000-000000000001',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        province: 'TP. Hồ Chí Minh',
        paymentMethod: 'CASH',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-race-1',
        accessTokenHash: 'hash-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingOrder as any);
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      } as any);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`idempotency_key`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['idempotency_key'] },
        },
      );
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      const result = await service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: '00000000-0000-0000-0000-000000000001',
        idempotencyKey: 'idem-race-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.trackingToken).toBeNull();
      expect(result.order).toBeNull();
    });

    it('should throw ConflictException on P2002 idempotency_key collision when concurrent payload differs', async () => {
      const existingOrder = {
        id: 'ord-race-2',
        code: 'ORD-RACE-2',
        branchId: '00000000-0000-0000-0000-000000000001',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        paymentMethod: 'CASH',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-race-conflict',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingOrder as any);
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      } as any);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`idempotency_key`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['idempotency_key'] },
        },
      );
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      await expect(
        service.createOrder({
          customerName: 'Attacker',
          customerPhone: '0909998888',
          address: '999 Nguyen Hue',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          idempotencyKey: 'idem-race-conflict',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should rethrow P2002 error when unique violation is on code rather than idempotency_key', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.storeConfig, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        key: 'DEFAULT',
        customerOrderingEnabled: true,
        contactPhone: '0988888888',
      } as any);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);

      const codeCollisionError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`code`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['code'] },
        },
      );
      jest
        .spyOn(prisma, '$transaction')
        .mockRejectedValueOnce(codeCollisionError);

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          idempotencyKey: 'idem-code-collision',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toBe(codeCollisionError);
    });

    it('should return duplicate response on P2002 idempotency_key collision during concurrent createStaffOrder', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'c1@example.com',
        role: 'CASHIER',
        branchId: 'branch-assigned-1',
      };
      const existingOrder = {
        id: 'ord-staff-race-1',
        code: 'ORD-STAFF-RACE-1',
        branchId: 'branch-assigned-1',
        customerName: 'Khach E',
        customerPhone: '0901112222',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        paymentMethod: 'CASH',
        source: 'STAFF',
        idempotencyKey: 'idem-staff-race-1',
        accessTokenHash: 'secret-hash',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingOrder as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-assigned-1',
        isActive: true,
      } as any);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`idempotency_key`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['idempotency_key'] },
        },
      );
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      const result = await service.createStaffOrder(
        {
          customerName: 'Khach E',
          customerPhone: '0901112222',
          address: '123 Le Loi',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          branchId: 'branch-assigned-1',
          idempotencyKey: 'idem-staff-race-1',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        },
        cashierUser.sub,
        cashierUser.role,
        cashierUser,
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.trackingToken).toBeNull();
      expect((result.order as any)?.id).toBe('ord-staff-race-1');
      expect((result.order as any)?.accessTokenHash).toBeUndefined();
    });

    it('should store idempotencyFingerprint on createOrder and accept retry even if shipping rule changes or calculateShipping fails', async () => {
      let persistedOrderData: Record<string, any> | undefined;
      let currentOrderRecord: any = null;

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation((() =>
          Promise.resolve(
            currentOrderRecord,
          )) as unknown as typeof prisma.order.findUnique);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);
      const calcSpy = jest
        .spyOn(shippingService, 'calculateShipping')
        .mockResolvedValueOnce({
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          fee: 25000,
          branch: {
            id: 'branch-fallback',
            code: 'CN-Q7',
            name: 'Chi nhánh Q7',
            address: 'Q7',
          },
        });

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              persistedOrderData = data;
              currentOrderRecord = {
                id: 'ord-fallback-1',
                ...data,
                createdAt: new Date('2026-10-25T10:00:00Z'),
                items: [{ productId: 'uuid-1', quantity: 1 }],
                statusHistories: [],
              };
              return currentOrderRecord;
            }),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
          },
        });
      });

      const originalPayload = {
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        branchId: 'branch-requested-unsupported',
        idempotencyKey: 'idem-fallback-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      };

      const created = await service.createOrder(originalPayload);
      expect(created.isDuplicate).toBe(false);
      expect(created.order?.branchId).toBe('branch-fallback');
      expect(created.order).not.toHaveProperty('idempotencyFingerprint');
      expect(persistedOrderData?.idempotencyFingerprint).toMatch(
        /^[0-9a-f]{64}$/,
      );

      // Shipping service subsequently changes branch or temporarily fails
      calcSpy.mockRejectedValueOnce(new Error('Shipping service down'));
      calcSpy.mockClear();

      const retryResult = await service.createOrder(originalPayload);
      expect(retryResult.isDuplicate).toBe(true);
      expect(retryResult.order).toBeNull();
      expect(retryResult.trackingToken).toBeNull();
      expect(calcSpy).not.toHaveBeenCalled();
    });

    it('should reject public idempotency retry with ConflictException when a different dto.branchId falls back to the same branch', async () => {
      let currentOrderRecord: any = null;

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation((() =>
          Promise.resolve(
            currentOrderRecord,
          )) as unknown as typeof prisma.order.findUnique);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);
      jest.spyOn(shippingService, 'calculateShipping').mockResolvedValue({
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        fee: 25000,
        branch: {
          id: 'branch-fallback',
          code: 'CN-Q7',
          name: 'Chi nhánh Q7',
          address: 'Q7',
        },
      });
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          order: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              currentOrderRecord = {
                id: 'ord-fallback-conflict-1',
                ...data,
                items: [{ productId: 'uuid-1', quantity: 1 }],
                statusHistories: [],
              };
              return currentOrderRecord;
            }),
          },
          orderStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
          },
        });
      });

      await service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        branchId: 'branch-unsupported-1',
        idempotencyKey: 'idem-fallback-diff-branch',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          paymentMethod: 'CASH',
          branchId: 'branch-unsupported-2',
          idempotencyKey: 'idem-fallback-diff-branch',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );
    });

    it('should reject legacy order without idempotencyFingerprint with ConflictException when branchId differs instead of guessing via shipping', async () => {
      const legacyOrder = {
        id: 'ord-legacy-fallback',
        code: 'ORD-LEGACY-1',
        branchId: 'branch-fallback',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-legacy-fallback',
        idempotencyFingerprint: null,
        accessTokenHash: 'secret-hash',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(legacyOrder as any);
      const calcSpy = jest.spyOn(shippingService, 'calculateShipping');

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          paymentMethod: 'CASH',
          branchId: 'branch-requested-unsupported',
          idempotencyKey: 'idem-legacy-fallback',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );
      expect(calcSpy).not.toHaveBeenCalled();
    });

    it('should reject legacy order without idempotencyFingerprint with ConflictException when retry omits branchId', async () => {
      const legacyNonDefaultOrder = {
        id: 'ord-legacy-no-branch-1',
        code: 'ORD-LEGACY-NB-1',
        branchId: 'branch-2',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-legacy-no-branch-1',
        idempotencyFingerprint: null,
        accessTokenHash: 'secret-hash',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      const legacyDefaultBranchOrder = {
        ...legacyNonDefaultOrder,
        id: 'ord-legacy-no-branch-2',
        code: 'ORD-LEGACY-NB-2',
        branchId: '00000000-0000-0000-0000-000000000001',
        idempotencyKey: 'idem-legacy-no-branch-2',
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(legacyNonDefaultOrder as any)
        .mockResolvedValueOnce(legacyDefaultBranchOrder as any);

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          paymentMethod: 'CASH',
          idempotencyKey: 'idem-legacy-no-branch-1',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          paymentMethod: 'CASH',
          idempotencyKey: 'idem-legacy-no-branch-2',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should accept legacy order without idempotencyFingerprint when retry provides matching branchId and fields without returning order or token', async () => {
      const legacyOrder = {
        id: 'ord-legacy-valid-1',
        code: 'ORD-LEGACY-VALID-1',
        branchId: 'branch-1',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        source: 'STOREFRONT',
        idempotencyKey: 'idem-legacy-valid-1',
        idempotencyFingerprint: null,
        accessTokenHash: 'secret-hash',
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(legacyOrder as any);

      const result = await service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        branchId: 'branch-1',
        idempotencyKey: 'idem-legacy-valid-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.order).toBeNull();
      expect(result.trackingToken).toBeNull();
    });

    it('should handle concurrent P2002 collision with fallback via stored idempotencyFingerprint (accept same branchId, reject different branchId)', async () => {
      let persistedOrderData: Record<string, any> | undefined;

      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as any,
      ]);
      jest.spyOn(shippingService, 'calculateShipping').mockResolvedValue({
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        fee: 25000,
        branch: {
          id: 'branch-fallback',
          code: 'CN-Q7',
          name: 'Chi nhánh Q7',
          address: 'Q7',
        },
      });

      // First, capture the fingerprint generated for branch-unsupported-1
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce(null);
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(async (cb: any) => {
          return cb({
            order: {
              create: jest.fn().mockImplementation(async ({ data }: any) => {
                persistedOrderData = data;
                return {
                  id: 'ord-winner',
                  ...data,
                  items: [{ productId: 'uuid-1', quantity: 1 }],
                };
              }),
            },
            orderStatusHistory: {
              create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
            },
          });
        });

      await service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        branchId: 'branch-unsupported-1',
        idempotencyKey: 'idem-fallback-race-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      const winningOrder = {
        id: 'ord-winner',
        ...persistedOrderData,
        items: [{ productId: 'uuid-1', quantity: 1 }],
        statusHistories: [],
      };

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`idempotency_key`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['idempotency_key'] },
        },
      );

      // Concurrent retry with SAME requested branchId -> accepted even if shipping changes on next lookup
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winningOrder as any);
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      const sameBranchRace = await service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 7',
        ward: 'Phường Tân Phú',
        paymentMethod: 'CASH',
        branchId: 'branch-unsupported-1',
        idempotencyKey: 'idem-fallback-race-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      });

      expect(sameBranchRace.isDuplicate).toBe(true);
      expect(sameBranchRace.order).toBeNull();
      expect(sameBranchRace.trackingToken).toBeNull();

      // Concurrent retry with DIFFERENT requested branchId that also falls back to branch-fallback -> 409 Conflict
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winningOrder as any);
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      await expect(
        service.createOrder({
          customerName: 'Nguyen Van A',
          customerPhone: '0901234567',
          address: '123 Le Loi',
          district: 'Quận 7',
          ward: 'Phường Tân Phú',
          paymentMethod: 'CASH',
          branchId: 'branch-unsupported-2',
          idempotencyKey: 'idem-fallback-race-1',
          items: [{ productId: 'uuid-1', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Khóa trùng lặp (idempotency key) không khớp với thông tin đơn hàng gốc!',
      );
    });

    it('should accept public retry when branchId is omitted on both requests and reject STAFF-source key reuse', async () => {
      let persistedOrderData: Record<string, unknown> | undefined;
      let currentOrderRecord: unknown = null;

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation((() =>
          Promise.resolve(
            currentOrderRecord,
          )) as unknown as typeof prisma.order.findUnique);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as never,
      ]);

      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            order: {
              create: jest
                .fn()
                .mockImplementation(
                  ({ data }: { data: Record<string, unknown> }) => {
                    persistedOrderData = data;
                    currentOrderRecord = {
                      id: 'ord-omit-branch-1',
                      ...data,
                      items: [{ productId: 'uuid-1', quantity: 1 }],
                      statusHistories: [],
                    };
                    return Promise.resolve(currentOrderRecord);
                  },
                ),
            },
            orderStatusHistory: {
              create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
            },
          });
        });

      const omittedBranchPayload = {
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-omit-branch-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      };

      const created = await service.createOrder(omittedBranchPayload);
      expect(created.isDuplicate).toBe(false);
      expect(persistedOrderData?.idempotencyFingerprint).toMatch(
        /^[0-9a-f]{64}$/,
      );

      const retry = await service.createOrder(omittedBranchPayload);
      expect(retry.isDuplicate).toBe(true);
      expect(retry.order).toBeNull();
      expect(retry.trackingToken).toBeNull();

      // Reusing a STAFF-originated key with the same payload on public createOrder must conflict
      currentOrderRecord = {
        id: 'ord-staff-origin-1',
        code: 'ORD-STAFF-ORIGIN-1',
        branchId: 'branch-1',
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        address: '123 Le Loi',
        province: 'TP. Hồ Chí Minh',
        paymentMethod: 'CASH',
        source: 'STAFF',
        idempotencyKey: 'idem-staff-origin-1',
        idempotencyFingerprint: null,
        items: [{ productId: 'uuid-1', quantity: 1 }],
      };

      await expect(
        service.createOrder({
          ...omittedBranchPayload,
          branchId: 'branch-1',
          idempotencyKey: 'idem-staff-origin-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should store idempotencyFingerprint on createStaffOrder, return sanitized order on retry, and reject conflicts or cross-branch P2002', async () => {
      const cashierUser = {
        sub: 'cashier-1',
        email: 'c1@example.com',
        role: 'CASHIER',
        branchId: 'branch-assigned-1',
      };
      let persistedOrderData: Record<string, unknown> | undefined;
      let currentOrderRecord: Record<string, unknown> | null = null;

      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation((() =>
          Promise.resolve(
            currentOrderRecord,
          )) as unknown as typeof prisma.order.findUnique);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-assigned-1',
        isActive: true,
      } as never);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
        {
          id: 'uuid-1',
          name: 'Salmon Sashimi',
          sellingPrice: 120000,
          isActive: true,
        } as never,
      ]);

      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            order: {
              create: jest
                .fn()
                .mockImplementation(
                  ({ data }: { data: Record<string, unknown> }) => {
                    persistedOrderData = data;
                    currentOrderRecord = {
                      id: 'ord-staff-fp-1',
                      ...data,
                      items: [{ productId: 'uuid-1', quantity: 1 }],
                      statusHistories: [],
                    };
                    return Promise.resolve(currentOrderRecord);
                  },
                ),
            },
            orderStatusHistory: {
              create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
            },
          });
        });

      const staffDto = {
        customerName: 'Khach Staff',
        customerPhone: '0901112222',
        address: '123 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: 'branch-assigned-1',
        idempotencyKey: 'idem-staff-fp-1',
        items: [{ productId: 'uuid-1', quantity: 1 }],
      };

      const created = await service.createStaffOrder(
        staffDto,
        cashierUser.sub,
        cashierUser.role,
        cashierUser,
      );
      expect(created.isDuplicate).toBe(false);
      expect(persistedOrderData?.idempotencyFingerprint).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(created.order).not.toHaveProperty('idempotencyFingerprint');
      expect(created.order).not.toHaveProperty('accessTokenHash');

      const retry = await service.createStaffOrder(
        staffDto,
        cashierUser.sub,
        cashierUser.role,
        cashierUser,
      );
      expect(retry.isDuplicate).toBe(true);
      expect(retry.trackingToken).toBeNull();
      expect(retry.order?.id).toBe('ord-staff-fp-1');
      expect(retry.order).not.toHaveProperty('idempotencyFingerprint');
      expect(retry.order).not.toHaveProperty('accessTokenHash');

      // Mismatch with stored idempotencyFingerprint -> ConflictException
      await expect(
        service.createStaffOrder(
          { ...staffDto, customerPhone: '0908887777' },
          cashierUser.sub,
          cashierUser.role,
          cashierUser,
        ),
      ).rejects.toThrow(ConflictException);

      // P2002 collision on createStaffOrder with differing payload -> ConflictException
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`idempotency_key`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['idempotency_key'] },
        },
      );
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(currentOrderRecord);
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      await expect(
        service.createStaffOrder(
          { ...staffDto, customerName: 'Khach Khac' },
          cashierUser.sub,
          cashierUser.role,
          cashierUser,
        ),
      ).rejects.toThrow(ConflictException);

      // P2002 collision belonging to another branch -> ForbiddenException
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...(currentOrderRecord ?? {}),
          branchId: 'branch-other-99',
        } as never);
      jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(p2002Error);

      await expect(
        service.createStaffOrder(
          staffDto,
          cashierUser.sub,
          cashierUser.role,
          cashierUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject concurrent updateOrderStatus and cancelOrderByCustomer when updateMany count is 0, and lock ingredients sorted before warehouse_stocks', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-race-status-1',
        code: 'ORD-RACE-ST-1',
        branchId: 'branch-1',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
        items: [],
      } as never);

      jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'ord-race-status-1',
                status: OrderStatus.PENDING,
                code: 'ORD-RACE-ST-1',
                branchId: 'branch-1',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          });
        });

      await expect(
        service.updateOrderStatus('ord-race-status-1', OrderStatus.CONFIRMED),
      ).rejects.toThrow(BadRequestException);

      const rawToken = 'cancel-race-token';
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'ord-race-cancel-1',
        code: 'ORD-RACE-CN-1',
        branchId: 'branch-1',
        status: OrderStatus.CONFIRMED,
        accessTokenHash: createHash('sha256').update(rawToken).digest('hex'),
      } as never);

      jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'ord-race-cancel-1',
                status: OrderStatus.CONFIRMED,
                code: 'ORD-RACE-CN-1',
                branchId: 'branch-1',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          });
        });

      await expect(
        service.cancelOrderByCustomer('ORD-RACE-CN-1', rawToken, 'Huy don'),
      ).rejects.toThrow(BadRequestException);

      // Verify sorted ingredient lock before warehouse_stocks lock in PREPARING
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'ord-lock-order-1',
        code: 'ORD-LOCK-1',
        branchId: 'branch-1',
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
        items: [
          {
            productId: 'prod-1',
            productName: 'Combo',
            quantity: 1,
          },
        ],
      } as never);
      jest
        .spyOn(prisma.orderRecipeDeduction, 'findUnique')
        .mockResolvedValueOnce(null);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValueOnce({
        id: 'branch-1',
        name: 'CN 1',
        warehouseId: 'wh-1',
        warehouse: { id: 'wh-1', name: 'Kho 1' },
      } as never);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValueOnce([
        {
          id: 'prod-1',
          name: 'Combo',
          type: 'SINGLE',
          comboItemsAsParent: [],
        } as never,
      ]);
      jest.spyOn(prisma.recipe, 'findUnique').mockResolvedValueOnce({
        id: 'rec-1',
        productId: 'prod-1',
        isActive: true,
        items: [
          {
            ingredientId: 'ing-b',
            quantity: 2,
            ingredient: { name: 'B', unit: 'kg' },
          },
          {
            ingredientId: 'ing-a',
            quantity: 1,
            ingredient: { name: 'A', unit: 'kg' },
          },
        ],
      } as never);
      jest
        .spyOn(prisma.warehouseStock, 'findUnique')
        .mockResolvedValue({ currentStock: 10 } as never);

      const lockSteps: string[] = [];
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            $queryRaw: jest
              .fn()
              .mockImplementation(
                (strings: TemplateStringsArray, ...values: unknown[]) => {
                  const sql = strings.join('?');
                  if (sql.includes('inventory.ingredients')) {
                    lockSteps.push(`ing:${String(values[0])}`);
                    return Promise.resolve([{ id: String(values[0]) }]);
                  }
                  if (sql.includes('inventory.warehouse_stocks')) {
                    lockSteps.push(`ws:${String(values[1])}`);
                    return Promise.resolve([{ id: 'ws-1', currentStock: 10 }]);
                  }
                  return Promise.resolve([]);
                },
              ),
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'ord-lock-order-1',
                status: OrderStatus.CONFIRMED,
                code: 'ORD-LOCK-1',
                branchId: 'branch-1',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              update: jest.fn().mockResolvedValue({
                id: 'ord-lock-order-1',
                code: 'ORD-LOCK-1',
                branchId: 'branch-1',
                status: OrderStatus.PREPARING,
              }),
            },
            orderRecipeDeduction: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'ded-1' }),
            },
            warehouseStock: {
              update: jest.fn().mockResolvedValue({}),
            },
            ingredient: {
              update: jest.fn().mockResolvedValue({}),
            },
            inventoryTransaction: {
              create: jest.fn().mockResolvedValue({}),
            },
            orderStatusHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
          });
        });

      await service.updateOrderStatus(
        'ord-lock-order-1',
        OrderStatus.PREPARING,
        'Cook',
        'KITCHEN_STAFF',
      );
      expect(lockSteps).toEqual([
        'ing:ing-a',
        'ing:ing-b',
        'ws:ing-a',
        'ws:ing-b',
      ]);
    });
  });
});
