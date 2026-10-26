import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrderingService } from './ordering.service';
import { PrismaService } from './prisma.service';
import { RabbitMQService } from '@common/rabbitmq';

describe('OrderingService - createOrder', () => {
  let service: OrderingService;
  let prisma: PrismaService;
  let rabbitmqService: RabbitMQService;

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
            $transaction: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishEvent: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<OrderingService>(OrderingService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
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
});
