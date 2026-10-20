import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionType, TransactionReason, Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(type: TransactionType): string {
    const prefix = type === TransactionType.IN ? 'PNK' : 'PXK';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${dateStr}-${rand}`;
  }

  async getIngredients() {
    const items = await this.prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    return items.map((item) => {
      const stock = Number(item.currentStock);
      const min = Number(item.minStock);

      let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SAFE' = 'SAFE';
      if (stock <= 0) {
        status = 'OUT_OF_STOCK';
      } else if (stock <= min) {
        status = 'LOW_STOCK';
      }

      return {
        ...item,
        currentStock: stock,
        minStock: min,
        costPrice: Number(item.costPrice),
        status,
        isAlert: status !== 'SAFE',
      };
    });
  }

  async createIngredient(dto: CreateIngredientDto) {
    const existing = await this.prisma.ingredient.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Mã nguyên liệu "${dto.code}" đã tồn tại!`);
    }

    const initialQty =
      dto.initialStock && dto.initialStock > 0 ? dto.initialStock : 0;

    return this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          unit: dto.unit.trim(),
          costPrice: dto.costPrice,
          minStock: dto.minStock,
          currentStock: initialQty,
        },
      });

      if (initialQty > 0) {
        await tx.inventoryTransaction.create({
          data: {
            code: this.generateCode(TransactionType.IN),
            type: TransactionType.IN,
            reason: TransactionReason.INITIAL_STOCK,
            ingredientId: ingredient.id,
            quantity: initialQty,
            unitPrice: dto.costPrice,
            totalAmount: Number(initialQty) * Number(dto.costPrice),
            note: 'Khởi tạo số lượng tồn ban đầu',
            createdBy: 'SYSTEM_INIT',
          },
        });
      }

      return ingredient;
    });
  }

  async createTransaction(dto: CreateTransactionDto) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: dto.ingredientId },
    });
    if (!ingredient) {
      throw new NotFoundException(
        `Không tìm thấy nguyên liệu có ID "${dto.ingredientId}"`,
      );
    }

    const currentStock = Number(ingredient.currentStock);
    const qty = Number(dto.quantity);

    if (dto.type === TransactionType.OUT && currentStock < qty) {
      throw new BadRequestException(
        `Số lượng tồn không đủ để xuất! Tồn hiện tại: ${currentStock} ${ingredient.unit}, yêu cầu xuất: ${qty} ${ingredient.unit}`,
      );
    }

    const unitPrice =
      dto.unitPrice !== undefined
        ? Number(dto.unitPrice)
        : Number(ingredient.costPrice);
    const totalAmount = qty * unitPrice;
    const code = this.generateCode(dto.type);

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.inventoryTransaction.create({
        data: {
          code,
          type: dto.type,
          reason: dto.reason,
          ingredientId: dto.ingredientId,
          quantity: qty,
          unitPrice,
          totalAmount,
          note: dto.note,
          createdBy: dto.createdBy || 'ADMIN',
        },
        include: {
          ingredient: true,
        },
      });

      const updatedStock =
        dto.type === TransactionType.IN
          ? currentStock + qty
          : currentStock - qty;

      await tx.ingredient.update({
        where: { id: dto.ingredientId },
        data: { currentStock: updatedStock },
      });

      return transaction;
    });
  }

  async getTransactions(query: TransactionQueryDto) {
    const where: Prisma.InventoryTransactionWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.ingredientId) where.ingredientId = query.ingredientId;

    return this.prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        ingredient: {
          select: {
            code: true,
            name: true,
            unit: true,
          },
        },
      },
    });
  }

  async getAlerts() {
    const ingredients = await this.getIngredients();
    return ingredients.filter((item) => item.isAlert);
  }
}
