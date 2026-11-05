import { Test, TestingModule } from '@nestjs/testing';
import { OrderingController } from './ordering.controller';
import { OrderingService } from './ordering.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('OrderingController', () => {
  let controller: OrderingController;
  let service: OrderingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderingController],
      providers: [
        {
          provide: OrderingService,
          useValue: {
            createOrder: jest.fn(),
            trackOrder: jest.fn(),
            getOrders: jest.fn(),
            updateOrderStatus: jest.fn(),
            updatePaymentStatus: jest.fn(),
            cancelOrderByCustomer: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrderingController>(OrderingController);
    service = module.get<OrderingService>(OrderingService);
  });

  it('should call service.createOrder with idempotency header if body missing key', async () => {
    const dto = {
      customerName: 'A',
      customerPhone: '090',
      items: [],
    };
    await controller.createOrder(dto as any, 'hdr-key');
    expect(service.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'hdr-key',
      }),
    );
  });

  it('should call service.trackOrder with code and token', async () => {
    await controller.trackOrder('ORD-1', 'tok-1');
    expect(service.trackOrder).toHaveBeenCalledWith('ORD-1', 'tok-1', undefined);
  });

  it('should call service.trackOrder with code and phone', async () => {
    await controller.trackOrder('ORD-1', undefined, '0901234567');
    expect(service.trackOrder).toHaveBeenCalledWith('ORD-1', undefined, '0901234567');
  });

  it('should call service.getOrders with query dto including date range', async () => {
    const query = {
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      branchId: 'b-1',
      startDate: '2026-11-01',
      endDate: '2026-11-04',
    };
    await controller.getOrders(query);
    expect(service.getOrders).toHaveBeenCalledWith(query);
  });

  it('should call service.updateOrderStatus with id and dto', async () => {
    await controller.updateStatus(
      'uuid-1',
      { status: OrderStatus.CONFIRMED, reason: 'ok' },
      'ADMIN',
    );
    expect(service.updateOrderStatus).toHaveBeenCalledWith(
      'uuid-1',
      OrderStatus.CONFIRMED,
      'ok',
      'ADMIN',
    );
  });

  it('should call service.updatePaymentStatus with id and payment status', async () => {
    await controller.updatePayment('uuid-1', { paymentStatus: PaymentStatus.PAID });
    expect(service.updatePaymentStatus).toHaveBeenCalledWith('uuid-1', PaymentStatus.PAID);
  });

  it('should call service.cancelOrderByCustomer with code and token', async () => {
    await controller.cancelOrder('ORD-1', { token: 'tok-1', reason: 'change mind' });
    expect(service.cancelOrderByCustomer).toHaveBeenCalledWith('ORD-1', 'tok-1', 'change mind');
  });
});
