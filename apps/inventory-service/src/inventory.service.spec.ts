import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
        reason: TransactionReason.PURCHASE_IMPORT,
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
        reason: TransactionReason.PURCHASE_IMPORT,
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
        reason: TransactionReason.PURCHASE_IMPORT,
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
      jest.spyOn(prisma.outboxEvent, 'update').mockImplementation(outboxUpdate as any);

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
        reason: TransactionReason.PURCHASE_IMPORT,
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
        reason: TransactionReason.PURCHASE_IMPORT,
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
      jest.spyOn(prisma.outboxEvent, 'update').mockImplementation(outboxUpdate as any);

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
        reason: TransactionReason.PURCHASE_IMPORT,
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
      jest.spyOn(prisma.outboxEvent, 'update').mockImplementation(outboxUpdate as any);
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
});
