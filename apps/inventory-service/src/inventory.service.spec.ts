import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from './prisma.service';
import { TransactionType, TransactionReason } from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

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
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

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
});
