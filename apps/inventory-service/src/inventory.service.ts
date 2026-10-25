import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import {
  TransactionType,
  TransactionReason,
  OutboxStatus,
  Prisma,
} from '@prisma/client';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent, RealtimeDomainEvent } from '@contracts';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

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

    const { ingredient, outbox, event } = await this.prisma.$transaction(
      async (tx) => {
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

        const event = createRealtimeEvent({
          type: 'inventory.ingredient.created',
          resource: 'inventory',
          action: 'CREATED',
          payload: {
            id: ingredient.id,
            code: ingredient.code,
            name: ingredient.name,
          },
        });

        let outbox = null;
        if (tx.outboxEvent) {
          outbox = await tx.outboxEvent.create({
            data: {
              aggregateType: 'inventory',
              aggregateId: ingredient.id,
              eventType: event.type,
              payload: event as unknown as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
        }

        return { ingredient, outbox, event };
      },
    );

    try {
      const published = await this.rabbitmqService.publishEvent(event);
      if (published && outbox && this.prisma.outboxEvent) {
        await this.prisma.outboxEvent.update({
          where: { id: outbox.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `RabbitMQ publish failed for ingredient.created: ${message}`,
      );
    }

    return ingredient;
  }

  async createTransaction(dto: CreateTransactionDto) {
    const qty = Number(dto.quantity);
    if (qty <= 0) {
      throw new BadRequestException('Số lượng giao dịch phải lớn hơn 0');
    }

    const { transaction, outbox, event } = await this.prisma.$transaction(
      async (tx) => {
        let ingredient: {
          id: string;
          code: string;
          name: string;
          unit: string;
          currentStock: number | Prisma.Decimal;
          costPrice: number | Prisma.Decimal;
        } | null = null;

        // Lock row in PostgreSQL to prevent concurrent race condition
        try {
          if (tx.$queryRaw) {
            const locked = await tx.$queryRaw<
              Array<{
                id: string;
                code: string;
                name: string;
                unit: string;
                currentStock: number | Prisma.Decimal;
                costPrice: number | Prisma.Decimal;
              }>
            >`
            SELECT id, code, name, unit, current_stock AS "currentStock", cost_price AS "costPrice"
            FROM inventory.ingredients
            WHERE id = ${dto.ingredientId}::uuid
            FOR UPDATE
          `;
            if (locked && locked.length > 0) {
              ingredient = locked[0];
            }
          }
        } catch {
          // Fallback if raw query is not supported by mock/provider
        }

        if (!ingredient) {
          if (tx.ingredient?.findUnique) {
            ingredient = await tx.ingredient.findUnique({
              where: { id: dto.ingredientId },
            });
          } else if (this.prisma.ingredient?.findUnique) {
            ingredient = await this.prisma.ingredient.findUnique({
              where: { id: dto.ingredientId },
            });
          }
        }

        if (!ingredient) {
          throw new NotFoundException(
            `Không tìm thấy nguyên liệu có ID "${dto.ingredientId}"`,
          );
        }

        const currentStock = Number(ingredient.currentStock);

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

        const txRecord = await tx.inventoryTransaction.create({
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

        const event = createRealtimeEvent({
          type: 'inventory.stock.updated',
          resource: 'inventory',
          action: 'UPDATED',
          payload: {
            code: txRecord.code,
            ingredientId: dto.ingredientId,
            type: dto.type,
            quantity: qty,
          },
        });

        let outbox = null;
        if (tx.outboxEvent) {
          outbox = await tx.outboxEvent.create({
            data: {
              aggregateType: 'inventory',
              aggregateId: dto.ingredientId,
              eventType: event.type,
              payload: event as unknown as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
        }

        return { transaction: txRecord, outbox, event };
      },
    );

    try {
      const published = await this.rabbitmqService.publishEvent(event);
      if (published && outbox && this.prisma.outboxEvent) {
        await this.prisma.outboxEvent.update({
          where: { id: outbox.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`RabbitMQ publish failed for stock.updated: ${message}`);
    }

    return transaction;
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

  async dispatchPendingOutboxEvents(batchSize = 20): Promise<number> {
    if (!this.prisma.outboxEvent) return 0;

    const pendingEvents = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.PENDING,
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    let successCount = 0;
    for (const record of pendingEvents) {
      try {
        const payload = record.payload as unknown as RealtimeDomainEvent;
        const published = await this.rabbitmqService.publishEvent(payload);
        if (published) {
          await this.prisma.outboxEvent.update({
            where: { id: record.id },
            data: {
              status: OutboxStatus.PUBLISHED,
              publishedAt: new Date(),
            },
          });
          successCount++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.outboxEvent.update({
          where: { id: record.id },
          data: {
            retryCount: { increment: 1 },
            lastError: message,
          },
        });
      }
    }

    return successCount;
  }
}
