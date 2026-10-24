import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from './prisma.service';
import { TransactionType, TransactionReason } from '@prisma/client';
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

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
  });

  describe('createTransaction', () => {
    it('should throw BadRequestException when stock out quantity exceeds currentStock', async () => {
      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue({
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
