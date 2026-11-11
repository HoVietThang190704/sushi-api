import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ShippingService } from './shipping/shipping.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdatePaymentConfigDto } from './dto/update-payment-config.dto';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent, ORDER_TRACK_SCOPE } from '@contracts';
import {
  OrderStatus,
  PaymentStatus,
  TransactionType,
  TransactionReason,
  OutboxStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

export const DEFAULT_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class OrderingService {
  private readonly logger = new Logger(OrderingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmqService: RabbitMQService,
    private readonly jwtService: JwtService,
    private readonly shippingService: ShippingService,
  ) {}

  private generateOrderCode(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${rand}`;
  }

  private hashSecretToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createOrder(dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất 1 món');
    }

    // 1. Check idempotency key if provided
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { items: true, statusHistories: true },
      });
      if (existing) {
        return {
          order: existing,
          trackingToken: null,
          isDuplicate: true,
        };
      }
    }

    // 2. Fetch active products from catalog to snapshot name and price (DO NOT trust client prices)
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let calculatedTotal = 0;
    const orderItemsData: Array<{
      productId: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }> = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Sản phẩm ID "${item.productId}" không tồn tại hoặc đã ngừng kinh doanh`,
        );
      }
      const unitPrice = Number(product.sellingPrice);
      const subtotal = unitPrice * item.quantity;
      calculatedTotal += subtotal;

      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    // 3. Tính phí giao hàng (Shipping Fee) dựa vào Xã/Phường & Chi nhánh
    let shippingFee = 0;
    let effectiveBranchId = dto.branchId || DEFAULT_BRANCH_ID;

    if (dto.ward) {
      const shippingCalculation = await this.shippingService.calculateShipping({
        district: dto.district,
        ward: dto.ward,
        branchId: dto.branchId,
      });
      shippingFee = shippingCalculation.fee;
      if (shippingCalculation.branch?.id) {
        effectiveBranchId = shippingCalculation.branch.id;
      }
    }

    const finalTotalAmount = calculatedTotal + shippingFee;

    // 4. Generate raw tracking token and SHA-256 hash
    const rawTrackingToken = randomBytes(24).toString('hex');
    const accessTokenHash = this.hashSecretToken(rawTrackingToken);
    const code = this.generateOrderCode();
    const branchId = effectiveBranchId;

    // Snapshot cấu hình thanh toán chuyển khoản nếu khách chọn VIETQR / BANK_TRANSFER
    let paymentQrUrl: string | null = null;
    let paymentBankInfo: string | null = null;
    const normalizedMethod = dto.paymentMethod?.trim().toUpperCase() || 'CASH';

    if (normalizedMethod === 'VIETQR' || normalizedMethod === 'BANK_TRANSFER') {
      const activeConfig = await this.getPaymentConfig();
      if (activeConfig && activeConfig.isActive) {
        paymentQrUrl = activeConfig.qrImageUrl || null;
        paymentBankInfo = JSON.stringify({
          bankName: activeConfig.bankName,
          accountNumber: activeConfig.accountNumber,
          accountHolder: activeConfig.accountHolder,
          transferSyntax: activeConfig.transferSyntax,
          note: activeConfig.note,
        });
      }
    }

    // 5. Save in database transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          code,
          branchId,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim(),
          address: dto.address?.trim(),
          province: dto.province?.trim() || 'TP. Hồ Chí Minh',
          district: dto.district?.trim(),
          ward: dto.ward?.trim(),
          note: dto.note?.trim(),
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: dto.paymentMethod?.trim() || 'CASH',
          shippingFee,
          totalAmount: finalTotalAmount,
          paymentQrUrl,
          paymentBankInfo,
          idempotencyKey: dto.idempotencyKey || null,
          accessTokenHash,
          items: {
            create: orderItemsData.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          reason: 'Khởi tạo đơn hàng Giao tận nơi (Delivery)',
          changedBy: 'CUSTOMER',
        },
      });

      return newOrder;
    });

    // 5. Emit realtime domain event
    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.created',
          resource: 'order',
          action: 'CREATED',
          branchId: order.branchId,
          payload: {
            orderId: order.id,
            orderCode: order.code,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            totalAmount: Number(order.totalAmount),
            status: order.status,
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to publish order.created event: ${message}`);
    }

    return {
      order,
      trackingToken: rawTrackingToken,
      isDuplicate: false,
    };
  }

  async trackOrder(code: string, token?: string, phone?: string) {
    if (!code) {
      throw new BadRequestException('Mã đơn hàng là bắt buộc');
    }
    if (!token && !phone) {
      throw new BadRequestException(
        'Mã truy cập hoặc số điện thoại là bắt buộc để theo dõi đơn hàng',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { code },
      include: {
        items: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với mã "${code}"`);
    }

    let canCancel = false;
    let trackingTicket: string | undefined = undefined;

    if (token) {
      const expectedHash = this.hashSecretToken(token);
      if (order.accessTokenHash !== expectedHash) {
        throw new UnauthorizedException(
          'Mã truy cập theo dõi đơn hàng không chính xác',
        );
      }
      canCancel =
        order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.CONFIRMED;

      trackingTicket = this.jwtService.sign(
        {
          orderCode: order.code,
          scope: ORDER_TRACK_SCOPE,
        },
        {
          secret: process.env.JWT_SECRET || 'your-secret-key',
          expiresIn: '24h',
        },
      );
    } else if (phone) {
      const clearInputPhone = phone.replace(/\D/g, '');
      const clearCustomerPhone = order.customerPhone.replace(/\D/g, '');
      if (clearInputPhone !== clearCustomerPhone) {
        throw new UnauthorizedException(
          'Số điện thoại không khớp với thông tin khách hàng của đơn hàng',
        );
      }
      canCancel = false;
    }

    // Sanitize order output: remove internal token hash and include canCancel flag & trackingTicket
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accessTokenHash: _, ...sanitizedOrder } = order;
    return {
      ...sanitizedOrder,
      canCancel,
      trackingTicket,
    };
  }

  async cancelOrderByCustomer(code: string, token: string, reason?: string) {
    if (!code || !token) {
      throw new BadRequestException('Mã đơn hàng và mã truy cập là bắt buộc');
    }

    const order = await this.prisma.order.findUnique({
      where: { code },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với mã "${code}"`);
    }

    const expectedHash = this.hashSecretToken(token);
    if (order.accessTokenHash !== expectedHash) {
      throw new UnauthorizedException(
        'Mã truy cập theo dõi đơn hàng không chính xác',
      );
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Đơn hàng đang ở trạng thái "${order.status}", không thể tự hủy. Vui lòng liên hệ nhà hàng.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          reason: reason || 'Khách hàng tự hủy đơn',
          changedBy: 'CUSTOMER',
        },
      });

      return cancelledOrder;
    });

    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.status.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            status: updated.status,
            reason: reason || 'Khách hàng tự hủy đơn',
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish order.status.updated event: ${message}`,
      );
    }

    return updated;
  }

  private generateTxCode(type: TransactionType): string {
    const prefix = type === TransactionType.IN ? 'PNK' : 'PXK';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${dateStr}-${rand}`;
  }

  async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    reason?: string,
    changedBy = 'STAFF',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    // Ràng buộc đơn thanh toán chuyển khoản: bắt buộc phải có paymentStatus === 'PAID' trước khi CONFIRMED hoặc PREPARING
    const isTransferMethod =
      order.paymentMethod?.toUpperCase() === 'VIETQR' ||
      order.paymentMethod?.toUpperCase() === 'BANK_TRANSFER';

    if (
      isTransferMethod &&
      order.paymentStatus !== PaymentStatus.PAID &&
      (toStatus === OrderStatus.CONFIRMED || toStatus === OrderStatus.PREPARING)
    ) {
      throw new BadRequestException(
        'Đơn hàng thanh toán chuyển khoản cần được xác nhận thanh toán (Đã thanh toán) trước khi duyệt đơn hoặc chế biến!',
      );
    }

    // 1. Kiểm tra ràng buộc chuyển trạng thái nghiêm ngặt sang PREPARING
    let warehouseId: string | null = null;
    const requiredIngredientsMap: Record<
      string,
      { ingredientId: string; name: string; unit: string; quantity: number }
    > = {};

    if (toStatus === OrderStatus.PREPARING) {
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Đơn hàng cần được Xác nhận (CONFIRMED) trước khi bắt đầu chế biến. Trạng thái hiện tại: ${order.status}`,
        );
      }

      // Kiểm tra xem đơn đã từng được trừ kho trước đó chưa (idempotent)
      const existingDeduction =
        await this.prisma.orderRecipeDeduction.findUnique({
          where: { orderId: order.id },
        });

      if (!existingDeduction) {
        // Lấy chi nhánh và kho phụ trách
        const branch = await this.prisma.branch.findUnique({
          where: { id: order.branchId },
          include: { warehouse: true },
        });

        if (!branch || !branch.warehouseId) {
          throw new BadRequestException(
            `Chi nhánh phục vụ đơn hàng (${branch?.name || order.branchId}) chưa được cấu hình Kho nguyên vật liệu!`,
          );
        }
        warehouseId = branch.warehouseId;
        const warehouseName = branch.warehouse?.name || 'Kho chi nhánh';

        // Phân rã giỏ hàng và tính định mức công thức
        const orderItems = order.items || [];
        const productIds = orderItems.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          include: {
            comboItemsAsParent: {
              include: {
                childProduct: true,
              },
            },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        for (const item of orderItems) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new BadRequestException(
              `Sản phẩm "${item.productName || item.productId}" không tồn tại hoặc đã ngừng kinh doanh!`,
            );
          }

          if (product.type === 'SINGLE') {
            const recipe = await this.prisma.recipe.findUnique({
              where: { productId: product.id },
              include: {
                items: {
                  include: { ingredient: true },
                },
              },
            });

            if (!recipe || !recipe.isActive || recipe.items.length === 0) {
              throw new BadRequestException(
                `Món ăn "${item.productName || product.name}" chưa có công thức định mức nguyên vật liệu!`,
              );
            }

            for (const rItem of recipe.items) {
              const ingId = rItem.ingredientId;
              const needed = Number(rItem.quantity) * item.quantity;
              if (!requiredIngredientsMap[ingId]) {
                requiredIngredientsMap[ingId] = {
                  ingredientId: ingId,
                  name: rItem.ingredient?.name || ingId,
                  unit: rItem.ingredient?.unit || '',
                  quantity: 0,
                };
              }
              requiredIngredientsMap[ingId].quantity += needed;
            }
          } else if (product.type === 'COMBO') {
            for (const cItem of product.comboItemsAsParent) {
              const childQty = item.quantity * Number(cItem.quantity);
              const childRecipe = await this.prisma.recipe.findUnique({
                where: { productId: cItem.childProductId },
                include: {
                  items: {
                    include: { ingredient: true },
                  },
                },
              });

              if (
                !childRecipe ||
                !childRecipe.isActive ||
                childRecipe.items.length === 0
              ) {
                throw new BadRequestException(
                  `Món con "${cItem.childProduct?.name || cItem.childProductId}" trong combo "${item.productName}" chưa có công thức định mức!`,
                );
              }

              for (const rItem of childRecipe.items) {
                const ingId = rItem.ingredientId;
                const needed = Number(rItem.quantity) * childQty;
                if (!requiredIngredientsMap[ingId]) {
                  requiredIngredientsMap[ingId] = {
                    ingredientId: ingId,
                    name: rItem.ingredient?.name || ingId,
                    unit: rItem.ingredient?.unit || '',
                    quantity: 0,
                  };
                }
                requiredIngredientsMap[ingId].quantity += needed;
              }
            }
          }
        }

        // Kiểm tra tồn kho tại WarehouseStock
        const insufficientList: Array<{
          name: string;
          required: number;
          available: number;
          unit: string;
        }> = [];

        for (const req of Object.values(requiredIngredientsMap)) {
          const stockRecord = await this.prisma.warehouseStock.findUnique({
            where: {
              warehouseId_ingredientId: {
                warehouseId,
                ingredientId: req.ingredientId,
              },
            },
          });

          const available = stockRecord ? Number(stockRecord.currentStock) : 0;
          if (available < req.quantity) {
            insufficientList.push({
              name: req.name,
              required: req.quantity,
              available,
              unit: req.unit,
            });
          }
        }

        if (insufficientList.length > 0) {
          const detailMsg = insufficientList
            .map(
              (i) =>
                `• ${i.name}: Cần ${i.required} ${i.unit}, Hiện có ${i.available} ${i.unit}`,
            )
            .join('; ');
          throw new BadRequestException(
            `Kho "${warehouseName}" không đủ nguyên vật liệu để chế biến đơn hàng ${order.code}: ${detailMsg}`,
          );
        }
      }
    }

    // Thực hiện trong 1 transaction duy nhất: Khấu trừ tồn kho + Cập nhật trạng thái đơn
    const { updatedOrder, outboxRecord, realtimeEvent } =
      await this.prisma.$transaction(async (tx) => {
        // Kiểm tra concurrency: đảm bảo trạng thái đơn không bị thay đổi bởi thao tác khác
        const currentOrder = tx.order?.findUnique
          ? await tx.order.findUnique({
              where: { id: orderId },
              select: { id: true, status: true, code: true, branchId: true },
            })
          : order;

        if (!currentOrder || currentOrder.status !== order.status) {
          throw new BadRequestException(
            `Trạng thái đơn hàng ${order.code} đã bị thay đổi bởi thao tác khác (hiện tại: ${currentOrder?.status || 'Đã xoá'}). Vui lòng tải lại trang!`,
          );
        }

        if (
          toStatus === OrderStatus.PREPARING &&
          warehouseId &&
          Object.keys(requiredIngredientsMap).length > 0
        ) {
          // Đảm bảo idempotent trong transaction
          const txExistingDeduction = tx.orderRecipeDeduction?.findUnique
            ? await tx.orderRecipeDeduction.findUnique({
                where: { orderId: order.id },
              })
            : null;
          if (txExistingDeduction) {
            throw new BadRequestException(
              `Đơn hàng ${order.code} đã được khấu trừ kho trước đó!`,
            );
          }

          // Sắp xếp nguyên liệu theo ingredientId để tránh deadlock khi nhiều đơn cùng trừ
          const sortedIngredients = Object.values(requiredIngredientsMap).sort(
            (a, b) => a.ingredientId.localeCompare(b.ingredientId),
          );

          // Khóa dòng và kiểm tra tồn kho chính xác trong transaction
          for (const req of sortedIngredients) {
            let currentStockRecord: { id: string; currentStock: any } | null =
              null;
            if (tx.$queryRaw) {
              const rows = await tx.$queryRaw<
                Array<{ id: string; currentStock: any }>
              >`
                SELECT id, current_stock AS "currentStock"
                FROM inventory.warehouse_stocks
                WHERE warehouse_id = ${warehouseId}::uuid AND ingredient_id = ${req.ingredientId}::uuid
                FOR UPDATE
              `;
              if (rows.length > 0) {
                currentStockRecord = rows[0];
              }
            } else {
              currentStockRecord = await tx.warehouseStock.findUnique({
                where: {
                  warehouseId_ingredientId: {
                    warehouseId,
                    ingredientId: req.ingredientId,
                  },
                },
              });
            }

            const cur = currentStockRecord
              ? Number(currentStockRecord.currentStock)
              : 0;
            if (cur < req.quantity) {
              throw new BadRequestException(
                `Kho không đủ nguyên liệu "${req.name}" (Yêu cầu: ${req.quantity} ${req.unit}, Tồn thực tế: ${cur} ${req.unit})`,
              );
            }

            const updatedStock = cur - req.quantity;

            await tx.warehouseStock.update({
              where: {
                warehouseId_ingredientId: {
                  warehouseId,
                  ingredientId: req.ingredientId,
                },
              },
              data: {
                currentStock: updatedStock,
              },
            });

            if (tx.ingredient?.update) {
              await tx.ingredient.update({
                where: { id: req.ingredientId },
                data: {
                  currentStock: { decrement: req.quantity },
                },
              });
            }

            await tx.inventoryTransaction.create({
              data: {
                code: this.generateTxCode(TransactionType.OUT),
                type: TransactionType.OUT,
                reason: TransactionReason.KITCHEN_USAGE,
                warehouseId,
                orderId: order.id,
                ingredientId: req.ingredientId,
                quantity: req.quantity,
                note: `Xuất kho chế biến đơn hàng ${order.code}`,
                createdBy: changedBy,
              },
            });
          }

          await tx.orderRecipeDeduction.create({
            data: {
              orderId: order.id,
              orderCode: order.code,
              warehouseId,
            },
          });
        }

        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            status: toStatus,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus,
            reason,
            changedBy,
          },
        });

        const domainEvent = createRealtimeEvent({
          type: 'order.status.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            fromStatus: order.status,
            status: updated.status,
            reason,
            changedBy,
          },
        });

        let outbox = null;
        if (tx.outboxEvent) {
          outbox = await tx.outboxEvent.create({
            data: {
              aggregateType: 'order',
              aggregateId: updated.id,
              eventType: domainEvent.type,
              payload: domainEvent as unknown as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
        }

        return {
          updatedOrder: updated,
          outboxRecord: outbox,
          realtimeEvent: domainEvent,
        };
      });

    try {
      const published = await this.rabbitmqService.publishEvent(realtimeEvent);
      if (published && outboxRecord && this.prisma.outboxEvent) {
        await this.prisma.outboxEvent.update({
          where: { id: outboxRecord.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish order.status.updated event: ${message}`,
      );
    }

    return updatedOrder;
  }

  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng có ID "${orderId}"`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus,
      },
    });

    try {
      await this.rabbitmqService.publishEvent(
        createRealtimeEvent({
          type: 'order.payment.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: updated.branchId,
          payload: {
            orderId: updated.id,
            orderCode: updated.code,
            paymentStatus: updated.paymentStatus,
          },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish order.payment.updated event: ${message}`,
      );
    }

    return updated;
  }

  async getPaymentConfig() {
    let config = await this.prisma.paymentConfig.findUnique({
      where: { key: 'DEFAULT' },
    });

    if (!config) {
      config = await this.prisma.paymentConfig.create({
        data: {
          key: 'DEFAULT',
          bankName: 'MB Bank (Ngân hàng Quân Đội)',
          accountNumber: '0988888888',
          accountHolder: 'HANBI SUSHI PLATFORM',
          qrImageUrl: null,
          transferSyntax: 'HANBI',
          note: 'Vui lòng ghi đúng nội dung chuyển khoản để nhân viên đối chiếu và xác nhận nhanh nhất.',
          isActive: true,
        },
      });
    }

    return config;
  }

  async updatePaymentConfig(dto: UpdatePaymentConfigDto) {
    const existing = await this.getPaymentConfig();

    return this.prisma.paymentConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.bankName !== undefined && { bankName: dto.bankName?.trim() }),
        ...(dto.accountNumber !== undefined && {
          accountNumber: dto.accountNumber?.trim(),
        }),
        ...(dto.accountHolder !== undefined && {
          accountHolder: dto.accountHolder?.trim(),
        }),
        ...(dto.qrImageUrl !== undefined && {
          qrImageUrl: dto.qrImageUrl?.trim() || null,
        }),
        ...(dto.transferSyntax !== undefined && {
          transferSyntax: dto.transferSyntax?.trim().toUpperCase(),
        }),
        ...(dto.note !== undefined && { note: dto.note?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  private parseVietnamDateBoundary(dateStr: string, isEndOfDay = false): Date {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new BadRequestException(
        `Ngày "${dateStr}" không đúng định dạng YYYY-MM-DD`,
      );
    }
    const [year, month, day] = parts;
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new BadRequestException(`Ngày "${dateStr}" không hợp lệ`);
    }

    const testDate = new Date(Date.UTC(year, month - 1, day));
    if (
      testDate.getUTCFullYear() !== year ||
      testDate.getUTCMonth() !== month - 1 ||
      testDate.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `Ngày "${dateStr}" không tồn tại trên lịch`,
      );
    }

    // Vietnam is UTC+7 (Indochina Time).
    // Start of day in VN (00:00:00.000 +07:00) is equivalent to 17:00:00.000 UTC of previous day.
    // End of day in VN (23:59:59.999 +07:00) is equivalent to 16:59:59.999 UTC of current day.
    if (isEndOfDay) {
      return new Date(Date.UTC(year, month - 1, day, 23 - 7, 59, 59, 999));
    }
    return new Date(Date.UTC(year, month - 1, day, 0 - 7, 0, 0, 0));
  }

  async getOrders(params?: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    branchId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (
      params?.startDate &&
      params?.endDate &&
      params.startDate > params.endDate
    ) {
      throw new BadRequestException('startDate không thể lớn hơn endDate');
    }

    const createdAtFilter: Record<string, Date> = {};
    if (params?.startDate) {
      createdAtFilter.gte = this.parseVietnamDateBoundary(
        params.startDate,
        false,
      );
    }
    if (params?.endDate) {
      createdAtFilter.lte = this.parseVietnamDateBoundary(params.endDate, true);
    }

    return this.prisma.order.findMany({
      where: {
        status: params?.status,
        paymentStatus: params?.paymentStatus,
        branchId: params?.branchId,
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
