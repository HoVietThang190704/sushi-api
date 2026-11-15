import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuthModule, ROLES_KEY } from '@common';
import { Reflector } from '@nestjs/core';

describe('Inventory Security & Role Protection', () => {
  let controller: InventoryController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: {
            getIngredients: jest.fn(),
            createIngredient: jest.fn(),
            getAlerts: jest.fn(),
            createTransaction: jest.fn(),
            getTransactions: jest.fn(),
            getWarehouses: jest.fn(),
            createWarehouse: jest.fn(),
            getWarehouseStocks: jest.fn(),
            adjustWarehouseStock: jest.fn(),
            getRecipes: jest.fn(),
            getRecipeByProduct: jest.fn(),
            upsertRecipe: jest.fn(),
            deleteRecipe: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should restrict warehouse creation and recipe deletion to SUPER_ADMIN', () => {
    const createWarehouseRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createWarehouse,
    );
    expect(createWarehouseRoles).toEqual(['SUPER_ADMIN']);

    const deleteRecipeRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.deleteRecipe,
    );
    expect(deleteRecipeRoles).toEqual(['SUPER_ADMIN']);
  });

  it('should restrict stock adjustments and transactions to SUPER_ADMIN and BRANCH_MANAGER, and ingredient creation to SUPER_ADMIN', () => {
    const adjustStockRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.adjustWarehouseStock,
    );
    expect(adjustStockRoles).toEqual(['SUPER_ADMIN', 'BRANCH_MANAGER']);

    const createTransactionRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createTransaction,
    );
    expect(createTransactionRoles).toEqual(['SUPER_ADMIN', 'BRANCH_MANAGER']);

    const createIngredientRoles = reflector.get<string[]>(
      ROLES_KEY,
      controller.createIngredient,
    );
    expect(createIngredientRoles).toEqual(['SUPER_ADMIN']);
  });

  it('should forward user context to service for branch-scoped read and write inventory operations', async () => {
    const user = {
      sub: 'manager-1',
      email: 'manager@example.com',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
    };

    const service = (controller as any).inventoryService;

    await controller.getIngredients(user);
    expect(service.getIngredients).toHaveBeenCalledWith(user);

    await controller.getAlerts(user);
    expect(service.getAlerts).toHaveBeenCalledWith(user);

    const txQuery = { type: 'IN' as any };
    await controller.getTransactions(txQuery, user);
    expect(service.getTransactions).toHaveBeenCalledWith(txQuery, user);

    await controller.getWarehouses(user);
    expect(service.getWarehouses).toHaveBeenCalledWith(user);

    await controller.getWarehouseStocks('wh-1', user);
    expect(service.getWarehouseStocks).toHaveBeenCalledWith('wh-1', user);

    const adjustDto = {
      type: 'IN' as any,
      reason: 'RESTOCK' as any,
      quantity: 10,
    };
    await controller.adjustWarehouseStock('wh-1', 'ing-1', adjustDto, user);
    expect(service.adjustWarehouseStock).toHaveBeenCalledWith(
      'wh-1',
      'ing-1',
      adjustDto,
      user,
    );

    const txDto = {
      type: 'IN' as any,
      reason: 'PURCHASE_IMPORT' as any,
      ingredientId: 'ing-1',
      quantity: 5,
    };
    await controller.createTransaction(txDto, user);
    expect(service.createTransaction).toHaveBeenCalledWith(txDto, user);
  });
});
