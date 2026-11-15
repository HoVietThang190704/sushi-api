import { Test, TestingModule } from '@nestjs/testing';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { AuthModule, ROLES_KEY } from '@common';
import { Reflector } from '@nestjs/core';

describe('Shipping Security & Role Protection', () => {
  let controller: ShippingController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ShippingController],
      providers: [
        {
          provide: ShippingService,
          useValue: {
            getBranches: jest.fn(),
            getLocations: jest.fn(),
            calculateShipping: jest.fn(),
            getShippingRules: jest.fn(),
            upsertShippingRule: jest.fn(),
            updateShippingRule: jest.fn(),
            deleteShippingRule: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ShippingController>(ShippingController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should protect rule modification endpoints with SUPER_ADMIN', () => {
    const createRuleRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createShippingRule,
    );
    expect(createRuleRoles).toEqual(['SUPER_ADMIN']);

    const updateRuleRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.updateShippingRule,
    );
    expect(updateRuleRoles).toEqual(['SUPER_ADMIN']);

    const deleteRuleRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.deleteShippingRule,
    );
    expect(deleteRuleRoles).toEqual(['SUPER_ADMIN']);
  });

  it('should keep customer calculation and location endpoints public', () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, controller.getBranches),
    ).toBeUndefined();
    expect(
      reflector.get<string[]>(ROLES_KEY, controller.getLocations),
    ).toBeUndefined();
    expect(
      reflector.get<string[]>(ROLES_KEY, controller.calculateShipping),
    ).toBeUndefined();
  });

  it('should forward authenticated user context to getShippingRules', async () => {
    const user = {
      sub: 'manager-1',
      email: 'manager@hanbisushi.vn',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
    };
    const service = (controller as any).shippingService as ShippingService;

    await controller.getShippingRules('Quận 1', 'branch-2', user);

    expect(service.getShippingRules).toHaveBeenCalledWith(
      'Quận 1',
      'branch-2',
      user,
    );
  });
});
