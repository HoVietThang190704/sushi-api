import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderingService } from './ordering.service';
import { PrismaService } from './prisma.service';
import { ShippingService } from './shipping/shipping.service';
import { RabbitMQService } from '@common/rabbitmq';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';

describe('OrderingService - createOrder', () => {
  let service: OrderingService;
  let prisma: PrismaService;
  let rabbitmqService: RabbitMQService;
  let jwtService: JwtService;

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
              branch: { id: '00000000-0000-0000-0000-000000000001', name: 'Chi nhánh 1' },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OrderingService>(OrderingService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
    jwtService = module.get<JwtService>(JwtService);
    shippingService = module.get<ShippingService>(ShippingService);
  });

  it('should throw BadRequestException if items array is empty', async () => {
    await expect(
      service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        items: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if product is not found or inactive', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([]);

    await expect(
      service.createOrder({
        customerName: 'Nguyen Van A',
        customerPhone: '0901234567',
        items: [{ productId: 'uuid-missing', quantity: 2 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return existing order when same idempotencyKey is reused', async () => {
    const existingOrder = {
      id: 'uuid-order-existing',
      code: 'ORD-20261025-0001',
      idempotencyKey: 'key-123',
      totalAmount: 100000 as any,
      items: [],
    };

    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(existingOrder as any);

    const result = await service.createOrder({
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      idempotencyKey: 'key-123',
      items: [{ productId: 'uuid-1', quantity: 1 }],
    });

    expect(result.order).toEqual(existingOrder);
    expect(result.isDuplicate).toBe(true);
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
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue(mockProducts as any);

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
      items: [
        { productId: 'uuid-prod-1', quantity: 2 },
        { productId: 'uuid-prod-2', quantity: 1 },
      ],
    });

    expect(result.order).toEqual(createdOrder);
    expect(result.trackingToken).toBeDefined();
    expect(typeof result.trackingToken).toBe('string');
    expect(result.trackingToken.length).toBeGreaterThanOrEqual(32);
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
        accessTokenHash: createHash('sha256').update('real-token').digest('hex'),
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

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

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
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

      const result = await service.trackOrder('ORD-PHONE-01', undefined, '090 123 4567');
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
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

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
        items: [{ productId: 'prod-no-recipe', productName: 'Tuna Roll', quantity: 2 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest.spyOn(prisma.orderRecipeDeduction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
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
        items: [{ productId: 'prod-1', productName: 'Salmon Nigiri', quantity: 2 }],
      };

      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as any);
      jest.spyOn(prisma.branch, 'findUnique').mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-1',
        warehouse: { name: 'Kho 1' },
      } as any);
      jest.spyOn(prisma.orderRecipeDeduction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
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
      jest.spyOn(prisma.orderRecipeDeduction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
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
      jest.spyOn(prisma.orderRecipeDeduction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
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
        items: [{ productId: 'prod-1', productName: 'Salmon Nigiri', quantity: 2 }],
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
      jest.spyOn(prisma.orderRecipeDeduction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
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
      jest.spyOn(prisma.warehouseStock, 'findUnique').mockResolvedValue(mockStock as any);

      const updateStockMock = jest.fn().mockResolvedValue({ ...mockStock, currentStock: 400 });
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
    it('should query orders without date filter when none provided', async () => {
      const mockOrders = [{ id: 'order-1', code: 'ORD-1' }];
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);

      const result = await service.getOrders({
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
      });

      expect(result).toEqual(mockOrders);
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.PENDING,
          paymentStatus: undefined,
          branchId: 'branch-1',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          statusHistories: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    it('should calculate Vietnam timezone start-of-day boundary for startDate', async () => {
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

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
  });
});
