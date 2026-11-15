import { Test, TestingModule } from '@nestjs/testing';
import { OrderingController } from './ordering.controller';
import { OrderingService } from './ordering.service';
import { AuthModule, ROLES_KEY } from '@common';
import { Reflector } from '@nestjs/core';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('Ordering Security & Role Protection', () => {
  let controller: OrderingController;
  let service: OrderingService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
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
            getPaymentConfig: jest.fn(),
            updatePaymentConfig: jest.fn(),
            getStoreConfig: jest.fn(),
            updateStoreConfig: jest.fn(),
            createStaffOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrderingController>(OrderingController);
    service = module.get<OrderingService>(OrderingService);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should have RolesGuard applied on sensitive endpoints', () => {
    const updateStoreConfigRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.updateStoreConfig,
    );
    expect(updateStoreConfigRoles).toEqual(['SUPER_ADMIN']);

    const updatePaymentConfigRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.updatePaymentConfig,
    );
    expect(updatePaymentConfigRoles).toEqual(['SUPER_ADMIN']);

    const getOrdersRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.getOrders,
    );
    expect(getOrdersRoles).toEqual([
      'SUPER_ADMIN',
      'BRANCH_MANAGER',
      'CASHIER',
      'KITCHEN_STAFF',
    ]);

    const updateStatusRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.updateStatus,
    );
    expect(updateStatusRoles).toEqual([
      'SUPER_ADMIN',
      'BRANCH_MANAGER',
      'CASHIER',
      'KITCHEN_STAFF',
    ]);

    const updatePaymentRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.updatePayment,
    );
    expect(updatePaymentRoles).toEqual([
      'SUPER_ADMIN',
      'BRANCH_MANAGER',
      'CASHIER',
    ]);

    const createStaffOrderRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createStaffOrder,
    );
    expect(createStaffOrderRoles).toEqual([
      'SUPER_ADMIN',
      'BRANCH_MANAGER',
      'CASHIER',
    ]);
  });

  it('should leave public endpoints accessible without roles', () => {
    const getStoreConfigRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.getStoreConfig,
    );
    expect(getStoreConfigRoles).toBeUndefined();

    const getPaymentConfigRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.getPaymentConfig,
    );
    expect(getPaymentConfigRoles).toBeUndefined();

    const createOrderRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createOrder,
    );
    expect(createOrderRoles).toBeUndefined();

    const trackOrderRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.trackOrder,
    );
    expect(trackOrderRoles).toBeUndefined();

    const cancelOrderRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.cancelOrder,
    );
    expect(cancelOrderRoles).toBeUndefined();
  });

  it('should pass authenticated user context to ordering service in getOrders', async () => {
    const query = { status: OrderStatus.PENDING };
    const user = {
      sub: 'cashier-1',
      email: 'cashier@hanbisushi.vn',
      role: 'CASHIER',
      branchId: 'branch-uuid-1',
    };

    await controller.getOrders(query, user);
    expect(service.getOrders).toHaveBeenCalledWith(query, user);
  });

  it('should pass authenticated user context to ordering service in updateStatus', async () => {
    const user = {
      sub: 'cashier-1',
      email: 'cashier@hanbisushi.vn',
      role: 'CASHIER',
      branchId: 'branch-uuid-1',
    };

    await controller.updateStatus(
      'order-1',
      { status: OrderStatus.CONFIRMED, reason: 'confirmed' },
      undefined,
      user,
    );
    expect(service.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.CONFIRMED,
      'confirmed',
      'CASHIER',
      user,
    );
  });

  it('should pass authenticated user context to ordering service in updatePayment', async () => {
    const user = {
      sub: 'cashier-1',
      email: 'cashier@hanbisushi.vn',
      role: 'CASHIER',
      branchId: 'branch-uuid-1',
    };

    await controller.updatePayment(
      'order-1',
      { paymentStatus: PaymentStatus.PAID },
      user,
    );
    expect(service.updatePaymentStatus).toHaveBeenCalledWith(
      'order-1',
      PaymentStatus.PAID,
      user,
    );
  });
});
