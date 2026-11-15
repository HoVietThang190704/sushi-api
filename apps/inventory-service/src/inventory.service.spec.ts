import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from './prisma.service';
import {
  TransactionType,
  TransactionReason,
  OutboxStatus,
} from '@prisma/client';
import { RabbitMQService } from '@common/rabbitmq';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;
  let rabbitmqService: RabbitMQService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: {
            ingredient: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            inventoryTransaction: {
              findMany: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
            },
            outboxEvent: {
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            warehouse: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            branch: {
              findUnique: jest.fn(),
            },
            warehouseStock: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
            },
            product: {
              findUnique: jest.fn(),
            },
            recipe: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
              delete: jest.fn(),
            },
            recipeItem: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            $transaction: jest.fn(),
            $queryRaw: jest.fn(),
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

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
  });

  describe('createTransaction', () => {
    it('should throw BadRequestException when stock out quantity exceeds currentStock', async () => {
      const mockIngredient = {
        id: 'uuid-1',
        code: 'NL-01',
        name: 'Salmon',
        unit: 'kg',
        currentStock: 2 as any,
        minStock: 5 as any,
        costPrice: 100000 as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest
        .spyOn(prisma.ingredient, 'findUnique')
        .mockResolvedValue(mockIngredient);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          ingredient: {
            findUnique: jest.fn().mockResolvedValue(mockIngredient),
            update: jest.fn(),
          },
          inventoryTransaction: {
            create: jest.fn(),
          },
        });
      });

      await expect(
        service.createTransaction({
          type: TransactionType.OUT,
          reason: TransactionReason.KITCHEN_USAGE,
          ingredientId: 'uuid-1',
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create transaction and publish inventory.stock.updated event', async () => {
      const ingredient = {
        id: 'uuid-1',
        code: 'NL-01',
        name: 'Salmon',
        unit: 'kg',
        currentStock: 10 as any,
        minStock: 5 as any,
        costPrice: 100000 as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTxResult = {
        id: 'tx-1',
        code: 'PNK-20261024-1234',
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
        unitPrice: 100000,
        totalAmount: 500000,
        note: 'Import',
        createdBy: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue(ingredient);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          inventoryTransaction: {
            create: jest.fn().mockResolvedValue(mockTxResult),
          },
          ingredient: {
            findUnique: jest.fn().mockResolvedValue(ingredient),
            update: jest
              .fn()
              .mockResolvedValue({ ...ingredient, currentStock: 15 }),
          },
        });
      });

      const result = await service.createTransaction({
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
      });

      expect(result).toEqual(mockTxResult);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.stock.updated',
          resource: 'inventory',
          action: 'UPDATED',
          payload: {
            code: mockTxResult.code,
            ingredientId: 'uuid-1',
            type: TransactionType.IN,
            quantity: 5,
          },
        }),
      );
    });

    it('should create an outbox event in the transaction and update its status to PUBLISHED upon successful dispatch', async () => {
      const ingredient = {
        id: 'uuid-1',
        code: 'NL-01',
        name: 'Salmon',
        unit: 'kg',
        currentStock: 10 as any,
        minStock: 5 as any,
        costPrice: 100000 as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTxResult = {
        id: 'tx-1',
        code: 'PNK-20261024-1234',
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
        unitPrice: 100000,
        totalAmount: 500000,
        note: 'Import',
        createdBy: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOutbox = {
        id: 'outbox-1',
        aggregateType: 'inventory',
        aggregateId: 'uuid-1',
        eventType: 'inventory.stock.updated',
        payload: {},
        status: OutboxStatus.PENDING,
      };

      const txOutboxCreate = jest.fn().mockResolvedValue(mockOutbox);
      const txIngredientUpdate = jest
        .fn()
        .mockResolvedValue({ ...ingredient, currentStock: 15 });
      const txTransactionCreate = jest.fn().mockResolvedValue(mockTxResult);
      const outboxUpdate = jest
        .fn()
        .mockResolvedValue({ ...mockOutbox, status: OutboxStatus.PUBLISHED });
      jest
        .spyOn(prisma.outboxEvent, 'update')
        .mockImplementation(outboxUpdate as any);

      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue(ingredient);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          inventoryTransaction: { create: txTransactionCreate },
          ingredient: {
            findUnique: jest.fn().mockResolvedValue(ingredient),
            update: txIngredientUpdate,
          },
          outboxEvent: { create: txOutboxCreate },
          $queryRaw: jest.fn().mockResolvedValue([]),
        });
      });

      await service.createTransaction({
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
      });

      expect(txOutboxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aggregateType: 'inventory',
            aggregateId: 'uuid-1',
            eventType: 'inventory.stock.updated',
            status: OutboxStatus.PENDING,
          }),
        }),
      );
      expect(outboxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'outbox-1' },
          data: expect.objectContaining({
            status: OutboxStatus.PUBLISHED,
          }),
        }),
      );
    });

    it('should leave outbox event as PENDING and not throw when rabbitmq publish fails', async () => {
      const ingredient = {
        id: 'uuid-1',
        code: 'NL-01',
        name: 'Salmon',
        unit: 'kg',
        currentStock: 10 as any,
        minStock: 5 as any,
        costPrice: 100000 as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTxResult = {
        id: 'tx-1',
        code: 'PNK-20261024-1234',
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
        unitPrice: 100000,
        totalAmount: 500000,
        note: 'Import',
        createdBy: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOutbox = {
        id: 'outbox-2',
        aggregateType: 'inventory',
        aggregateId: 'uuid-1',
        eventType: 'inventory.stock.updated',
        payload: {},
        status: OutboxStatus.PENDING,
      };

      const txOutboxCreate = jest.fn().mockResolvedValue(mockOutbox);
      const outboxUpdate = jest.fn();
      jest
        .spyOn(prisma.outboxEvent, 'update')
        .mockImplementation(outboxUpdate as any);

      jest
        .spyOn(rabbitmqService, 'publishEvent')
        .mockRejectedValue(new Error('RabbitMQ connection lost'));
      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue(ingredient);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          inventoryTransaction: {
            create: jest.fn().mockResolvedValue(mockTxResult),
          },
          ingredient: {
            findUnique: jest.fn().mockResolvedValue(ingredient),
            update: jest
              .fn()
              .mockResolvedValue({ ...ingredient, currentStock: 15 }),
          },
          outboxEvent: { create: txOutboxCreate },
          $queryRaw: jest.fn().mockResolvedValue([]),
        });
      });

      // Should NOT throw an error even though RabbitMQ failed
      const result = await service.createTransaction({
        type: TransactionType.IN,
        reason: TransactionReason.PURCHASE,
        ingredientId: 'uuid-1',
        quantity: 5,
      });

      expect(result).toEqual(mockTxResult);
      expect(txOutboxCreate).toHaveBeenCalled();
      // Should NOT have marked as PUBLISHED
      expect(outboxUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OutboxStatus.PUBLISHED }),
        }),
      );
    });

    it('should sweep pending outbox events and mark them as PUBLISHED when rabbitmq succeeds', async () => {
      const pendingEvent = {
        id: 'outbox-pending-1',
        aggregateType: 'inventory',
        aggregateId: 'uuid-1',
        eventType: 'inventory.stock.updated',
        payload: {
          id: 'ev-1',
          type: 'inventory.stock.updated',
          resource: 'inventory',
          action: 'UPDATED',
        },
        status: OutboxStatus.PENDING,
        retryCount: 0,
      };

      jest
        .spyOn(prisma.outboxEvent, 'findMany')
        .mockResolvedValue([pendingEvent as any]);
      const outboxUpdate = jest
        .fn()
        .mockResolvedValue({ ...pendingEvent, status: OutboxStatus.PUBLISHED });
      jest
        .spyOn(prisma.outboxEvent, 'update')
        .mockImplementation(outboxUpdate as any);
      jest.spyOn(rabbitmqService, 'publishEvent').mockResolvedValue(true);

      const count = await service.dispatchPendingOutboxEvents();

      expect(count).toBe(1);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        pendingEvent.payload,
      );
      expect(outboxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'outbox-pending-1' },
          data: expect.objectContaining({ status: OutboxStatus.PUBLISHED }),
        }),
      );
    });
  });

  describe('createIngredient', () => {
    it('should create ingredient and publish inventory.ingredient.created event', async () => {
      const newIngredient = {
        id: 'uuid-2',
        code: 'NL-02',
        name: 'Tuna',
        unit: 'kg',
        costPrice: 200000 as any,
        minStock: 2 as any,
        currentStock: 0 as any,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          ingredient: {
            create: jest.fn().mockResolvedValue(newIngredient),
          },
        });
      });

      const result = await service.createIngredient({
        code: 'NL-02',
        name: 'Tuna',
        unit: 'kg',
        costPrice: 200000,
        minStock: 2,
      });

      expect(result).toEqual(newIngredient);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.ingredient.created',
          resource: 'inventory',
          action: 'CREATED',
          payload: {
            id: 'uuid-2',
            code: 'NL-02',
            name: 'Tuna',
          },
        }),
      );
    });
  });

  describe('Warehouse & WarehouseStock management', () => {
    it('should return list of warehouses', async () => {
      const mockWarehouses = [
        {
          id: 'wh-1',
          code: 'KHO-01',
          name: 'Kho Q1',
          address: '12 Le Thanh Ton',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { stocks: 5, branches: 1 },
        },
      ];

      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue(
        mockWarehouses,
      );

      const result = await service.getWarehouses();
      expect(result).toEqual(mockWarehouses);
      expect(prisma.warehouse.findMany).toHaveBeenCalled();
    });

    it('should throw BadRequestException when creating warehouse with existing code', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        code: 'KHO-01',
      });

      await expect(
        service.createWarehouse({
          code: 'KHO-01',
          name: 'Kho duplicate',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create warehouse successfully', async () => {
      const created = {
        id: 'wh-2',
        code: 'KHO-BT',
        name: 'Kho Binh Thanh',
        address: '45 D2',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.warehouse.create as jest.Mock).mockResolvedValue(created);

      const result = await service.createWarehouse({
        code: 'KHO-BT',
        name: 'Kho Binh Thanh',
        address: '45 D2',
      });

      expect(result).toEqual(created);
    });

    it('should reject deactivating a warehouse that still has linked branches', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        code: 'KHO-01',
        name: 'Kho 1',
        isActive: true,
      });
      (prisma.branch as any).count = jest.fn().mockResolvedValue(2);

      await expect(
        service.updateWarehouse('wh-1', { isActive: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject deleting a warehouse linked to branches', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        name: 'Kho 1',
        _count: { branches: 1, transactions: 0, deductions: 0 },
      });

      await expect(service.deleteWarehouse('wh-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should soft-deactivate a warehouse that has transaction history', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        name: 'Kho 1',
        _count: { branches: 0, transactions: 3, deductions: 0 },
      });
      const update = jest.fn().mockResolvedValue({});
      const del = jest.fn();
      (prisma.warehouse as any).update = update;
      (prisma.warehouse as any).delete = del;

      const result = await service.deleteWarehouse('wh-1');

      expect(result).toEqual({ id: 'wh-1', deleted: false, deactivated: true });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { isActive: false },
      });
      expect(del).not.toHaveBeenCalled();
    });

    it('should hard-delete a warehouse without branches or history', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        name: 'Kho 1',
        _count: { branches: 0, transactions: 0, deductions: 0 },
      });
      const del = jest.fn().mockResolvedValue({});
      (prisma.warehouse as any).delete = del;

      const result = await service.deleteWarehouse('wh-1');

      expect(result).toEqual({ id: 'wh-1', deleted: true, deactivated: false });
      expect(del).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
    });

    it('should return stocks for a given warehouse', async () => {
      const mockStocks = [
        {
          id: 'ws-1',
          warehouseId: 'wh-1',
          ingredientId: 'ing-1',
          currentStock: 100 as any,
          minStock: 10 as any,
          ingredient: {
            code: 'NL-CA-HOI',
            name: 'Ca hoi',
            unit: 'g',
            costPrice: 500 as any,
          },
        },
      ];

      (prisma.warehouseStock.findMany as jest.Mock).mockResolvedValue(
        mockStocks,
      );

      const result = await service.getWarehouseStocks('wh-1');
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            warehouseId: 'wh-1',
            currentStock: 100,
            status: 'SAFE',
          }),
        ]),
      );
    });

    it('should throw BadRequestException when adjusting stock out exceeds warehouse stock', async () => {
      const mockWarehouseStock = {
        id: 'ws-1',
        warehouseId: 'wh-1',
        ingredientId: 'ing-1',
        currentStock: 20 as any,
        minStock: 10 as any,
        ingredient: {
          id: 'ing-1',
          code: 'NL-CA-HOI',
          name: 'Ca hoi',
          unit: 'g',
          costPrice: 500 as any,
        },
      };

      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
      });
      (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
        id: 'ing-1',
        unit: 'g',
      });
      (prisma.warehouseStock.findUnique as jest.Mock).mockResolvedValue(
        mockWarehouseStock,
      );

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          warehouseStock: {
            findUnique: jest.fn().mockResolvedValue(mockWarehouseStock),
            update: jest.fn(),
          },
          inventoryTransaction: {
            create: jest.fn(),
          },
        });
      });

      await expect(
        service.adjustWarehouseStock('wh-1', 'ing-1', {
          type: TransactionType.OUT,
          reason: TransactionReason.KITCHEN_USAGE,
          quantity: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Recipe (BOM) management', () => {
    it('should throw BadRequestException if product is not found or is a COMBO', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-combo',
        type: 'COMBO',
      });

      await expect(
        service.upsertRecipe({
          productId: 'prod-combo',
          items: [{ ingredientId: 'ing-1', quantity: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if any ingredient in items does not exist', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        type: 'SINGLE',
      });
      (prisma.ingredient.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        service.upsertRecipe({
          productId: 'prod-1',
          items: [{ ingredientId: 'ing-nonexistent', quantity: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert recipe and recipe items successfully', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        type: 'SINGLE',
      });
      (prisma.ingredient.findMany as jest.Mock).mockResolvedValue([
        { id: 'ing-1', name: 'Ca hoi' },
      ]);

      const mockRecipe = {
        id: 'rec-1',
        productId: 'prod-1',
        notes: 'Chuan',
        isActive: true,
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          recipe: {
            upsert: jest.fn().mockResolvedValue(mockRecipe),
          },
          recipeItem: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      const result = await service.upsertRecipe({
        productId: 'prod-1',
        notes: 'Chuan',
        items: [{ ingredientId: 'ing-1', quantity: 100 }],
      });

      expect(result).toEqual(mockRecipe);
    });

    it('should return recipe by product id', async () => {
      const mockRecipe = {
        id: 'rec-1',
        productId: 'prod-1',
        items: [
          {
            id: 'item-1',
            ingredientId: 'ing-1',
            quantity: 100 as any,
            ingredient: { name: 'Ca hoi', unit: 'g' },
          },
        ],
      };

      (prisma.recipe.findUnique as jest.Mock).mockResolvedValue(mockRecipe);

      const result = await service.getRecipeByProduct('prod-1');
      expect(result).toEqual(mockRecipe);
      expect(prisma.recipe.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'prod-1' } }),
      );
    });
  });

  describe('Branch & Warehouse Isolation', () => {
    const managerUser = {
      sub: 'manager-1',
      email: 'manager@hanbisushi.vn',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
    };

    const kitchenUser = {
      sub: 'kitchen-1',
      email: 'kitchen@hanbisushi.vn',
      role: 'KITCHEN_STAFF',
      branchId: 'branch-1',
    };

    const superAdminUser = {
      sub: 'admin-1',
      email: 'admin@hanbisushi.vn',
      role: 'SUPER_ADMIN',
      branchId: null,
    };

    it('should fail closed on getWarehouseStocks and adjustWarehouseStock when branch is missing or has no warehouseId', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.getWarehouseStocks('wh-1', managerUser),
      ).rejects.toThrow(ForbiddenException);

      (prisma.branch.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'branch-1',
        warehouseId: null,
        isActive: true,
      });
      await expect(
        service.adjustWarehouseStock(
          'wh-1',
          'ing-1',
          {
            type: TransactionType.IN,
            reason: TransactionReason.PURCHASE,
            quantity: 5,
          },
          managerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block cross-warehouse access for branch-scoped staff', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      await expect(
        service.getWarehouseStocks('wh-branch-2', kitchenUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.createTransaction(
          {
            type: TransactionType.IN,
            reason: TransactionReason.PURCHASE,
            ingredientId: 'ing-1',
            warehouseId: 'wh-branch-2',
            quantity: 5,
          },
          managerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should pin createTransaction to assigned branch warehouse when warehouseId is omitted and set createdBy from user', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const txTransactionCreate = jest.fn().mockResolvedValue({
        id: 'tx-1',
        code: 'PNK-1',
        warehouseId: 'wh-branch-1',
      });
      const txWarehouseFindFirst = jest.fn();

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          warehouse: { findFirst: txWarehouseFindFirst },
          ingredient: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ing-1',
              code: 'NL-1',
              name: 'Salmon',
              unit: 'kg',
              currentStock: 10,
              costPrice: 100000,
              minStock: 2,
            }),
            update: jest.fn(),
          },
          inventoryTransaction: { create: txTransactionCreate },
        });
      });

      await service.createTransaction(
        {
          type: TransactionType.IN,
          reason: TransactionReason.PURCHASE,
          ingredientId: 'ing-1',
          quantity: 5,
          createdBy: 'SPOOFED_USER',
        },
        managerUser,
      );

      expect(txWarehouseFindFirst).not.toHaveBeenCalled();
      expect(txTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-branch-1',
            createdBy: 'manager@hanbisushi.vn',
          }),
        }),
      );
    });

    it('should filter warehouses, transactions, ingredients, and alerts to branch warehouse for non-SUPER_ADMIN', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue([]);
      await service.getWarehouses(managerUser);
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, id: 'wh-branch-1' },
        }),
      );

      (prisma.inventoryTransaction.findMany as jest.Mock).mockResolvedValue([]);
      await service.getTransactions({ type: TransactionType.IN }, kitchenUser);
      expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: TransactionType.IN, warehouseId: 'wh-branch-1' },
        }),
      );

      (prisma.ingredient.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ing-1',
          code: 'NL-1',
          name: 'Salmon',
          unit: 'kg',
          currentStock: 50,
          minStock: 5,
          costPrice: 100000,
          warehouseStocks: [],
        },
      ]);

      const branchAlerts = await service.getAlerts(kitchenUser);
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            warehouseStocks: { where: { warehouseId: 'wh-branch-1' } },
            _count: {
              select: {
                transactions: { where: { warehouseId: 'wh-branch-1' } },
              },
            },
          }),
        }),
      );
      expect(branchAlerts).toHaveLength(1);
      expect(branchAlerts[0].currentStock).toBe(0);
      expect(branchAlerts[0].status).toBe('OUT_OF_STOCK');

      (prisma.ingredient.findMany as jest.Mock).mockClear();
      await service.getIngredients(superAdminUser);
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            warehouseStocks: true,
            _count: {
              select: { transactions: true },
            },
          }),
        }),
      );

      (prisma.warehouse.findMany as jest.Mock).mockClear();
      await service.getWarehouses(superAdminUser);
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('should reject createTransaction OUT when target warehouse stock is insufficient even if global ingredient stock is sufficient', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const txInventoryCreate = jest.fn();
      const txWarehouseStockUpdate = jest.fn();
      const txWarehouseStockCreate = jest.fn();

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          ingredient: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ing-1',
              code: 'NL-1',
              name: 'Salmon',
              unit: 'kg',
              currentStock: 50,
              costPrice: 100000,
              minStock: 2,
            }),
            update: jest.fn(),
          },
          warehouseStock: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              warehouseId: 'wh-branch-1',
              ingredientId: 'ing-1',
              currentStock: 3,
              minStock: 2,
            }),
            create: txWarehouseStockCreate,
            update: txWarehouseStockUpdate,
          },
          inventoryTransaction: {
            create: txInventoryCreate.mockResolvedValue({
              id: 'tx-1',
              code: 'PXK-1',
            }),
          },
        });
      });

      await expect(
        service.createTransaction(
          {
            type: TransactionType.OUT,
            reason: TransactionReason.KITCHEN_USAGE,
            ingredientId: 'ing-1',
            quantity: 10,
          },
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(txInventoryCreate).not.toHaveBeenCalled();
      expect(txWarehouseStockUpdate).not.toHaveBeenCalled();
      expect(txWarehouseStockCreate).not.toHaveBeenCalled();
    });

    it('should reject createTransaction OUT when target warehouse has no stock record yet even if global ingredient stock is sufficient', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const txInventoryCreate = jest.fn();
      const txWarehouseStockCreate = jest.fn();

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          ingredient: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ing-1',
              code: 'NL-1',
              name: 'Salmon',
              unit: 'kg',
              currentStock: 50,
              costPrice: 100000,
              minStock: 2,
            }),
            update: jest.fn(),
          },
          warehouseStock: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: txWarehouseStockCreate,
            update: jest.fn(),
          },
          inventoryTransaction: {
            create: txInventoryCreate.mockResolvedValue({
              id: 'tx-1',
              code: 'PXK-1',
            }),
          },
        });
      });

      await expect(
        service.createTransaction(
          {
            type: TransactionType.OUT,
            reason: TransactionReason.KITCHEN_USAGE,
            ingredientId: 'ing-1',
            quantity: 5,
          },
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(txInventoryCreate).not.toHaveBeenCalled();
      expect(txWarehouseStockCreate).not.toHaveBeenCalled();
    });

    it('should deduct target warehouse stock and global ingredient stock when warehouse stock is sufficient', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const txWarehouseStockUpdate = jest.fn().mockResolvedValue({});
      const txIngredientUpdate = jest.fn().mockResolvedValue({});

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          ingredient: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ing-1',
              code: 'NL-1',
              name: 'Salmon',
              unit: 'kg',
              currentStock: 50,
              costPrice: 100000,
              minStock: 2,
            }),
            update: txIngredientUpdate,
          },
          warehouseStock: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              warehouseId: 'wh-branch-1',
              ingredientId: 'ing-1',
              currentStock: 10,
              minStock: 2,
            }),
            create: jest.fn(),
            update: txWarehouseStockUpdate,
          },
          inventoryTransaction: {
            create: jest.fn().mockResolvedValue({
              id: 'tx-out-1',
              code: 'PXK-1',
              warehouseId: 'wh-branch-1',
            }),
          },
        });
      });

      await service.createTransaction(
        {
          type: TransactionType.OUT,
          reason: TransactionReason.KITCHEN_USAGE,
          ingredientId: 'ing-1',
          quantity: 4,
        },
        managerUser,
      );

      expect(txWarehouseStockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentStock: 6 },
        }),
      );
      expect(txIngredientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentStock: 46 },
        }),
      );
    });

    it('should surface database errors from $queryRaw instead of falling back to unlocked findUnique', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const dbError = new Error('canceling statement due to lock timeout');
      const txIngredientFindUnique = jest.fn();
      const txWarehouseFindUnique = jest.fn();

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          $queryRaw: jest.fn().mockRejectedValue(dbError),
          ingredient: {
            findUnique: txIngredientFindUnique,
            update: jest.fn(),
          },
          warehouseStock: {
            findUnique: txWarehouseFindUnique,
            create: jest.fn(),
            update: jest.fn(),
          },
          inventoryTransaction: {
            create: jest.fn(),
          },
        });
      });

      await expect(
        service.createTransaction(
          {
            type: TransactionType.OUT,
            reason: TransactionReason.KITCHEN_USAGE,
            ingredientId: 'ing-1',
            quantity: 2,
          },
          managerUser,
        ),
      ).rejects.toThrow('canceling statement due to lock timeout');

      expect(txIngredientFindUnique).not.toHaveBeenCalled();
      expect(txWarehouseFindUnique).not.toHaveBeenCalled();
    });

    it('should also surface database errors when locking warehouse_stocks fails after ingredient lock succeeds', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
        warehouseId: 'wh-branch-1',
        isActive: true,
      });

      const wsDbError = new Error(
        'could not serialize access due to concurrent update',
      );
      const txWarehouseFindUnique = jest.fn();
      const txInventoryCreate = jest.fn();

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          $queryRaw: jest
            .fn()
            .mockResolvedValueOnce([
              {
                id: 'ing-1',
                code: 'NL-1',
                name: 'Salmon',
                unit: 'kg',
                currentStock: 50,
                costPrice: 100000,
                minStock: 2,
              },
            ])
            .mockRejectedValueOnce(wsDbError),
          ingredient: {
            findUnique: jest.fn(),
            update: jest.fn(),
          },
          warehouseStock: {
            findUnique: txWarehouseFindUnique,
            create: jest.fn(),
            update: jest.fn(),
          },
          inventoryTransaction: {
            create: txInventoryCreate,
          },
        });
      });

      await expect(
        service.createTransaction(
          {
            type: TransactionType.OUT,
            reason: TransactionReason.KITCHEN_USAGE,
            ingredientId: 'ing-1',
            quantity: 2,
          },
          managerUser,
        ),
      ).rejects.toThrow('could not serialize access due to concurrent update');

      expect(txWarehouseFindUnique).not.toHaveBeenCalled();
      expect(txInventoryCreate).not.toHaveBeenCalled();
    });

    it('should lock inventory.ingredients before inventory.warehouse_stocks in adjustWarehouseStock', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue({
        id: 'wh-1',
        name: 'Kho 1',
      });
      (prisma.ingredient.findUnique as jest.Mock).mockResolvedValue({
        id: 'ing-1',
        name: 'Salmon',
        unit: 'kg',
        costPrice: 100000,
        minStock: 2,
      });

      const lockOrder: string[] = [];
      const txQueryRaw = jest
        .fn()
        .mockImplementation((strings: TemplateStringsArray) => {
          const sql = strings.join('?');
          if (sql.includes('inventory.ingredients')) {
            lockOrder.push('ingredients');
            return Promise.resolve([{ id: 'ing-1', currentStock: 50 }]);
          }
          if (sql.includes('inventory.warehouse_stocks')) {
            lockOrder.push('warehouse_stocks');
            return Promise.resolve([
              { id: 'ws-1', currentStock: 20, minStock: 2 },
            ]);
          }
          return Promise.resolve([]);
        });

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb({
          $queryRaw: txQueryRaw,
          warehouseStock: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest
              .fn()
              .mockResolvedValue({ id: 'ws-1', currentStock: 15 }),
          },
          ingredient: {
            update: jest.fn().mockResolvedValue({}),
          },
          inventoryTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'tx-1', code: 'PXK-1' }),
          },
        });
      });

      await service.adjustWarehouseStock('wh-1', 'ing-1', {
        type: TransactionType.OUT,
        reason: TransactionReason.KITCHEN_USAGE,
        quantity: 5,
      });

      expect(lockOrder).toEqual(['ingredients', 'warehouse_stocks']);
    });
  });
});
