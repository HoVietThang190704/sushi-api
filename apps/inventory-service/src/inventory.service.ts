import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { UpsertRecipeDto } from './dto/upsert-recipe.dto';
import {
  TransactionType,
  TransactionReason,
  OutboxStatus,
  Prisma,
} from '@prisma/client';
import { RabbitMQService } from '@common/rabbitmq';
import { OutboxDispatcherService } from '@common/outbox';
import { createRealtimeEvent } from '@contracts';
import { randomBytes } from 'crypto';
import type { RequestUser } from '@common';

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
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${dateStr}-${rand}`;
  }

  private async resolveAuthorizedWarehouseId(
    user?: RequestUser,
    requestedWarehouseId?: string,
  ): Promise<string | undefined> {
    if (!user || user.role === 'SUPER_ADMIN') {
      return requestedWarehouseId;
    }

    if (!user.branchId) {
      throw new ForbiddenException(
        'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
      );
    }

    if (!this.prisma.branch?.findUnique) {
      throw new ForbiddenException(
        'Không thể xác minh chi nhánh hoạt động của tài khoản!',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: user.branchId },
    });

    if (!branch || branch.isActive === false) {
      throw new ForbiddenException(
        'Không tìm thấy chi nhánh hoạt động được gán cho tài khoản!',
      );
    }

    if (!branch.warehouseId) {
      throw new ForbiddenException(
        'Chi nhánh của bạn chưa được gán kho nguyên vật liệu!',
      );
    }

    if (requestedWarehouseId && branch.warehouseId !== requestedWarehouseId) {
      throw new ForbiddenException(
        'Bạn chỉ có quyền thao tác trên kho nguyên vật liệu thuộc chi nhánh của mình!',
      );
    }

    return branch.warehouseId;
  }

  async getIngredients(user?: RequestUser) {
    const authorizedWarehouseId = await this.resolveAuthorizedWarehouseId(user);
    const items = await this.prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        warehouseStocks: authorizedWarehouseId
          ? { where: { warehouseId: authorizedWarehouseId } }
          : true,
        _count: {
          select: {
            transactions: authorizedWarehouseId
              ? { where: { warehouseId: authorizedWarehouseId } }
              : true,
          },
        },
      },
    });

    return items.map((item) => {
      const hasWarehouseStocks =
        item.warehouseStocks && item.warehouseStocks.length > 0;
      const stock = authorizedWarehouseId
        ? item.warehouseStocks.reduce(
            (sum, ws) => sum + Number(ws.currentStock),
            0,
          )
        : hasWarehouseStocks
          ? item.warehouseStocks.reduce(
              (sum, ws) => sum + Number(ws.currentStock),
              0,
            )
          : Number(item.currentStock);
      const min =
        authorizedWarehouseId && hasWarehouseStocks
          ? Number(item.warehouseStocks[0].minStock)
          : Number(item.minStock);

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
              claimedBy: 'inline-publisher',
              claimedUntil: new Date(Date.now() + 15_000),
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
            claimedBy: null,
            claimedUntil: null,
          },
        });
      } else if (!published && outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: outbox.id, claimedBy: 'inline-publisher' },
          data: { claimedBy: null, claimedUntil: null },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `RabbitMQ publish failed for ingredient.created: ${message}`,
      );
      if (outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent
          .updateMany({
            where: { id: outbox.id, claimedBy: 'inline-publisher' },
            data: { claimedBy: null, claimedUntil: null },
          })
          .catch(() => undefined);
      }
    }

    return ingredient;
  }

  async createTransaction(dto: CreateTransactionDto, user?: RequestUser) {
    const authorizedWarehouseId = await this.resolveAuthorizedWarehouseId(
      user,
      dto.warehouseId,
    );
    const actor = user
      ? user.email || user.sub || user.role
      : dto.createdBy || 'ADMIN';

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
          minStock?: number | Prisma.Decimal;
        } | null = null;

        // Lock row in PostgreSQL to prevent concurrent race condition
        if (typeof tx.$queryRaw === 'function') {
          const locked = await tx.$queryRaw<
            Array<{
              id: string;
              code: string;
              name: string;
              unit: string;
              currentStock: number | Prisma.Decimal;
              costPrice: number | Prisma.Decimal;
              minStock?: number | Prisma.Decimal;
            }>
          >`
            SELECT id, code, name, unit, current_stock AS "currentStock", cost_price AS "costPrice", min_stock AS "minStock"
            FROM inventory.ingredients
            WHERE id = ${dto.ingredientId}::uuid
            FOR UPDATE
          `;
          if (Array.isArray(locked) && locked.length > 0) {
            ingredient = locked[0];
          }
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

        let targetWarehouseId = authorizedWarehouseId || dto.warehouseId;
        if (
          !targetWarehouseId &&
          (!user || user.role === 'SUPER_ADMIN') &&
          tx.warehouse?.findFirst
        ) {
          const defaultWh = await tx.warehouse.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          targetWarehouseId = defaultWh?.id;
        }

        let ws: { id: string; currentStock: any; minStock?: any } | null = null;
        if (targetWarehouseId && tx.warehouseStock) {
          if (typeof tx.$queryRaw === 'function') {
            const wsRows = await tx.$queryRaw<
              Array<{ id: string; currentStock: any; minStock?: any }>
            >`
              SELECT id, current_stock AS "currentStock", min_stock AS "minStock"
              FROM inventory.warehouse_stocks
              WHERE warehouse_id = ${targetWarehouseId}::uuid AND ingredient_id = ${dto.ingredientId}::uuid
              FOR UPDATE
            `;
            if (Array.isArray(wsRows) && wsRows.length > 0) {
              ws = wsRows[0];
            }
          }

          if (!ws && tx.warehouseStock.findUnique) {
            ws = await tx.warehouseStock.findUnique({
              where: {
                warehouseId_ingredientId: {
                  warehouseId: targetWarehouseId,
                  ingredientId: dto.ingredientId,
                },
              },
            });
          }

          const warehouseCurrentStock = ws ? Number(ws.currentStock) : 0;
          if (dto.type === TransactionType.OUT && warehouseCurrentStock < qty) {
            throw new BadRequestException(
              `Kho không đủ tồn nguyên liệu "${ingredient.name}" để xuất! Tồn tại kho: ${warehouseCurrentStock} ${ingredient.unit}, yêu cầu xuất: ${qty} ${ingredient.unit}`,
            );
          }
        }

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
            warehouseId: targetWarehouseId,
            ingredientId: dto.ingredientId,
            quantity: qty,
            unitPrice,
            totalAmount,
            note: dto.note,
            createdBy: actor,
          },
          include: {
            ingredient: true,
          },
        });

        if (targetWarehouseId && tx.warehouseStock) {
          if (!ws && tx.warehouseStock.create) {
            ws = await tx.warehouseStock.create({
              data: {
                warehouseId: targetWarehouseId,
                ingredientId: dto.ingredientId,
                currentStock: 0,
                minStock: ingredient.minStock || 0,
              },
            });
          }

          if (ws && tx.warehouseStock.update) {
            const curWs = Number(ws.currentStock);
            const newWs =
              dto.type === TransactionType.IN ? curWs + qty : curWs - qty;
            await tx.warehouseStock.update({
              where: {
                warehouseId_ingredientId: {
                  warehouseId: targetWarehouseId,
                  ingredientId: dto.ingredientId,
                },
              },
              data: { currentStock: newWs },
            });
          }
        }

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
              claimedBy: 'inline-publisher',
              claimedUntil: new Date(Date.now() + 15_000),
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
            claimedBy: null,
            claimedUntil: null,
          },
        });
      } else if (!published && outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: outbox.id, claimedBy: 'inline-publisher' },
          data: { claimedBy: null, claimedUntil: null },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`RabbitMQ publish failed for stock.updated: ${message}`);
      if (outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent
          .updateMany({
            where: { id: outbox.id, claimedBy: 'inline-publisher' },
            data: { claimedBy: null, claimedUntil: null },
          })
          .catch(() => undefined);
      }
    }

    return transaction;
  }

  async getTransactions(query: TransactionQueryDto, user?: RequestUser) {
    const authorizedWarehouseId = await this.resolveAuthorizedWarehouseId(user);
    const where: Prisma.InventoryTransactionWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.ingredientId) where.ingredientId = query.ingredientId;
    if (authorizedWarehouseId) where.warehouseId = authorizedWarehouseId;

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

  async getAlerts(user?: RequestUser) {
    const ingredients = await this.getIngredients(user);
    return ingredients.filter((item) => item.isAlert);
  }

  async dispatchPendingOutboxEvents(batchSize = 20): Promise<number> {
    const dispatcher = new OutboxDispatcherService(
      this.prisma,
      this.rabbitmqService,
    );
    return dispatcher.dispatchBatch(batchSize);
  }

  // ==========================================
  // WAREHOUSES & WAREHOUSE STOCKS
  // ==========================================

  async getWarehouses(user?: RequestUser) {
    const authorizedWarehouseId = await this.resolveAuthorizedWarehouseId(user);
    return this.prisma.warehouse.findMany({
      where: authorizedWarehouseId
        ? { isActive: true, id: authorizedWarehouseId }
        : { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            stocks: true,
            branches: true,
          },
        },
      },
    });
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException(`Mã kho "${dto.code}" đã tồn tại!`);
    }

    return this.prisma.warehouse.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        isActive: true,
      },
    });
  }

  async getWarehouseStocks(warehouseId: string, user?: RequestUser) {
    await this.resolveAuthorizedWarehouseId(user, warehouseId);

    const stocks = await this.prisma.warehouseStock.findMany({
      where: { warehouseId },
      include: {
        ingredient: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            costPrice: true,
            isActive: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return stocks.map((s) => {
      const stock = Number(s.currentStock);
      const min = Number(s.minStock);

      let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SAFE' = 'SAFE';
      if (stock <= 0) {
        status = 'OUT_OF_STOCK';
      } else if (stock <= min) {
        status = 'LOW_STOCK';
      }

      return {
        ...s,
        currentStock: stock,
        minStock: min,
        status,
        isAlert: status !== 'SAFE',
      };
    });
  }

  async adjustWarehouseStock(
    warehouseId: string,
    ingredientId: string,
    dto: AdjustStockDto,
    user?: RequestUser,
  ) {
    await this.resolveAuthorizedWarehouseId(user, warehouseId);
    const actor = user
      ? user.email || user.sub || user.role
      : dto.createdBy || 'ADMIN';

    const qty = Number(dto.quantity);
    if (qty <= 0) {
      throw new BadRequestException('Số lượng điều chỉnh phải lớn hơn 0');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException(`Không tìm thấy kho ID "${warehouseId}"`);
    }

    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
    });
    if (!ingredient) {
      throw new NotFoundException(
        `Không tìm thấy nguyên liệu ID "${ingredientId}"`,
      );
    }

    const { transaction, updatedStockRecord, outbox, event } =
      await this.prisma.$transaction(async (tx) => {
        if (typeof tx.$queryRaw === 'function') {
          const lockedIngredients = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id
            FROM inventory.ingredients
            WHERE id = ${ingredientId}::uuid
            FOR UPDATE
          `;
          if (
            Array.isArray(lockedIngredients) &&
            lockedIngredients.length === 0
          ) {
            throw new NotFoundException(
              `Không tìm thấy nguyên liệu ID "${ingredientId}"`,
            );
          }
        }

        let currentStockRecord: {
          id: string;
          currentStock: any;
          minStock?: any;
        } | null = null;

        if (typeof tx.$queryRaw === 'function') {
          const rows = await tx.$queryRaw<
            Array<{ id: string; currentStock: any; minStock: any }>
          >`
            SELECT id, current_stock AS "currentStock", min_stock AS "minStock"
            FROM inventory.warehouse_stocks
            WHERE warehouse_id = ${warehouseId}::uuid AND ingredient_id = ${ingredientId}::uuid
            FOR UPDATE
          `;
          if (Array.isArray(rows) && rows.length > 0) {
            currentStockRecord = rows[0];
          }
        }

        if (!currentStockRecord) {
          currentStockRecord = await tx.warehouseStock.findUnique({
            where: {
              warehouseId_ingredientId: { warehouseId, ingredientId },
            },
          });
        }

        if (!currentStockRecord) {
          currentStockRecord = await tx.warehouseStock.create({
            data: {
              warehouseId,
              ingredientId,
              currentStock: 0,
              minStock: ingredient.minStock,
            },
          });
        }

        const currentStock = Number(currentStockRecord.currentStock);
        if (dto.type === TransactionType.OUT && currentStock < qty) {
          throw new BadRequestException(
            `Kho "${warehouse.name || warehouse.code}" không đủ tồn nguyên liệu "${ingredient.name || ingredient.code}" để xuất! Tồn hiện tại: ${currentStock} ${ingredient.unit}, yêu cầu xuất: ${qty} ${ingredient.unit}`,
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
            warehouseId,
            ingredientId,
            quantity: qty,
            unitPrice,
            totalAmount,
            note: dto.note,
            createdBy: actor,
          },
        });

        const newStock =
          dto.type === TransactionType.IN
            ? currentStock + qty
            : currentStock - qty;

        const updated = await tx.warehouseStock.update({
          where: {
            warehouseId_ingredientId: { warehouseId, ingredientId },
          },
          data: {
            currentStock: newStock,
          },
        });

        if (tx.ingredient?.update) {
          const delta = dto.type === TransactionType.IN ? qty : -qty;
          await tx.ingredient.update({
            where: { id: ingredientId },
            data: {
              currentStock: { increment: delta },
            },
          });
        }

        const event = createRealtimeEvent({
          type: 'inventory.stock.updated',
          resource: 'inventory',
          action: 'UPDATED',
          payload: {
            code: txRecord.code,
            warehouseId,
            ingredientId,
            type: dto.type,
            quantity: qty,
            currentStock: newStock,
          },
        });

        let outbox = null;
        if (tx.outboxEvent) {
          outbox = await tx.outboxEvent.create({
            data: {
              aggregateType: 'warehouse_stock',
              aggregateId: `${warehouseId}_${ingredientId}`,
              eventType: event.type,
              payload: event as unknown as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
              claimedBy: 'inline-publisher',
              claimedUntil: new Date(Date.now() + 15_000),
            },
          });
        }

        return {
          transaction: txRecord,
          updatedStockRecord: updated,
          outbox,
          event,
        };
      });

    try {
      const published = await this.rabbitmqService.publishEvent(event);
      if (published && outbox && this.prisma.outboxEvent) {
        await this.prisma.outboxEvent.update({
          where: { id: outbox.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            claimedBy: null,
            claimedUntil: null,
          },
        });
      } else if (!published && outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: outbox.id, claimedBy: 'inline-publisher' },
          data: { claimedBy: null, claimedUntil: null },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `RabbitMQ publish failed for warehouse stock update: ${message}`,
      );
      if (outbox && this.prisma.outboxEvent?.updateMany) {
        await this.prisma.outboxEvent
          .updateMany({
            where: { id: outbox.id, claimedBy: 'inline-publisher' },
            data: { claimedBy: null, claimedUntil: null },
          })
          .catch(() => undefined);
      }
    }

    return {
      transaction,
      stock: updatedStockRecord,
    };
  }

  // ==========================================
  // RECIPES (BOM)
  // ==========================================

  async getRecipes() {
    return this.prisma.recipe.findMany({
      where: { isActive: true },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            sellingPrice: true,
            imageUrl: true,
            type: true,
          },
        },
        items: {
          include: {
            ingredient: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                costPrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecipeByProduct(productId: string) {
    return this.prisma.recipe.findUnique({
      where: { productId },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            sellingPrice: true,
            type: true,
          },
        },
        items: {
          include: {
            ingredient: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                costPrice: true,
              },
            },
          },
        },
      },
    });
  }

  async upsertRecipe(dto: UpsertRecipeDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new BadRequestException(
        `Không tìm thấy món ăn ID "${dto.productId}"`,
      );
    }

    if (product.type === 'COMBO') {
      throw new BadRequestException(
        `Không thể tạo công thức trực tiếp cho sản phẩm COMBO ("${product.name || product.id}"). Công thức được tự động suy diễn từ các món đơn thành phần!`,
      );
    }

    // Verify all ingredients exist
    const ingredientIds = dto.items.map((i) => i.ingredientId);
    const existingIngredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
    });
    if (existingIngredients.length !== ingredientIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều nguyên liệu trong công thức không tồn tại',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.upsert({
        where: { productId: dto.productId },
        update: {
          notes: dto.notes,
          isActive: true,
        },
        create: {
          productId: dto.productId,
          notes: dto.notes,
          isActive: true,
        },
      });

      await tx.recipeItem.deleteMany({
        where: { recipeId: recipe.id },
      });

      await tx.recipeItem.createMany({
        data: dto.items.map((item) => ({
          recipeId: recipe.id,
          ingredientId: item.ingredientId,
          quantity: item.quantity,
        })),
      });

      return recipe;
    });
  }

  async deleteRecipe(id: string) {
    return this.prisma.recipe.delete({
      where: { id },
    });
  }
}
