import * as dotenv from 'dotenv';
dotenv.config({ path: '.env', quiet: true });

import { ConflictException } from '@nestjs/common';

import {
  OrderStatus,
  PaymentStatus,
  PrismaClient,
  TransactionReason,
  TransactionType,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { OrderingService } from '../apps/ordering-service/src/ordering.service';
import { ShippingService } from '../apps/ordering-service/src/shipping/shipping.service';
import { VietnamAddressService } from '../apps/ordering-service/src/shipping/vietnam-address.service';
import { InventoryService } from '../apps/inventory-service/src/inventory.service';

describe('Real PostgreSQL Concurrency Integration', () => {
  let prisma: PrismaClient;
  let orderingService: OrderingService;
  let inventoryService: InventoryService;

  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdIngredientIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdWarehouseIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const rabbitmqMock = {
      publishEvent: jest.fn().mockResolvedValue(true),
    } as any;
    const jwtService = new JwtService();
    const shippingService = new ShippingService(
      prisma as any,
      new VietnamAddressService(),
    );

    orderingService = new OrderingService(
      prisma as any,
      rabbitmqMock,
      jwtService,
      shippingService,
    );
    inventoryService = new InventoryService(prisma as any, rabbitmqMock);
  });

  afterAll(async () => {
    try {
      if (createdWarehouseIds.length > 0) {
        await prisma.orderRecipeDeduction.deleteMany({
          where: { warehouseId: { in: createdWarehouseIds } },
        });
        await prisma.inventoryTransaction.deleteMany({
          where: { warehouseId: { in: createdWarehouseIds } },
        });
        await prisma.warehouseStock.deleteMany({
          where: { warehouseId: { in: createdWarehouseIds } },
        });
      }
      if (createdOrderIds.length > 0) {
        await prisma.inventoryTransaction.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.orderRecipeDeduction.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }
      if (createdBranchIds.length > 0) {
        await prisma.order.deleteMany({
          where: { branchId: { in: createdBranchIds } },
        });
      }
      if (createdProductIds.length > 0) {
        await prisma.recipe.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      if (createdIngredientIds.length > 0) {
        await prisma.inventoryTransaction.deleteMany({
          where: { ingredientId: { in: createdIngredientIds } },
        });
        await prisma.ingredient.deleteMany({
          where: { id: { in: createdIngredientIds } },
        });
      }
      if (createdBranchIds.length > 0) {
        await prisma.branch.deleteMany({
          where: { id: { in: createdBranchIds } },
        });
      }
      if (createdWarehouseIds.length > 0) {
        await prisma.warehouse.deleteMany({
          where: { id: { in: createdWarehouseIds } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('handles concurrent createOrder with identical idempotencyKey without leaking P2002', async () => {
    const storeConfig = await orderingService.getStoreConfig();
    if (!storeConfig.customerOrderingEnabled) {
      throw new Error('Test requires customerOrderingEnabled=true');
    }

    const suffix = randomUUID().slice(0, 8);
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-PG-${suffix}`,
        name: `Test Warehouse ${suffix}`,
      },
    });
    createdWarehouseIds.push(warehouse.id);

    const branch = await prisma.branch.create({
      data: {
        code: `BR-PG-${suffix}`,
        name: `Test Branch ${suffix}`,
        address: '1 Test Street',
        phone: '0901234567',
        warehouseId: warehouse.id,
      },
    });
    createdBranchIds.push(branch.id);

    const product = await prisma.product.create({
      data: {
        sku: `SKU-PG-${suffix}`,
        name: `Test Sushi ${suffix}`,
        sellingPrice: 120000,
        isActive: true,
      },
    });
    createdProductIds.push(product.id);

    await prisma.shippingRule.create({
      data: {
        branchId: branch.id,
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        fee: 15000,
        isDefault: true,
        isActive: true,
      },
    });

    const idempotencyKey = `pg-idem-${suffix}`;
    const payload = {
      customerName: 'Nguyen Concurrency',
      customerPhone: '0901234567',
      address: '123 Le Loi',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      branchId: branch.id,
      idempotencyKey,
      items: [{ productId: product.id, quantity: 2 }],
    };

    const [resA, resB] = await Promise.all([
      orderingService.createOrder(payload),
      orderingService.createOrder(payload),
    ]);

    const results = [resA, resB];
    const createdResults = results.filter((r) => !r.isDuplicate);
    const duplicateResults = results.filter((r) => r.isDuplicate);

    expect(createdResults).toHaveLength(1);
    expect(duplicateResults).toHaveLength(1);
    expect(createdResults[0].order).not.toBeNull();
    expect(createdResults[0].trackingToken).toBeTruthy();
    expect(duplicateResults[0].order).toBeNull();
    expect(duplicateResults[0].trackingToken).toBeNull();

    const persistedOrders = await prisma.order.findMany({
      where: { idempotencyKey },
    });
    expect(persistedOrders).toHaveLength(1);
    createdOrderIds.push(persistedOrders[0].id);
  }, 20000);

  it('prevents deadlock and double-deduction under concurrent PREPARING and manual stock OUT', async () => {
    const suffix = randomUUID().slice(0, 8);
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-LOCK-${suffix}`,
        name: `Lock Warehouse ${suffix}`,
      },
    });
    createdWarehouseIds.push(warehouse.id);

    const branch = await prisma.branch.create({
      data: {
        code: `BR-LOCK-${suffix}`,
        name: `Lock Branch ${suffix}`,
        address: '2 Lock Street',
        phone: '0901234567',
        warehouseId: warehouse.id,
      },
    });
    createdBranchIds.push(branch.id);

    const ingA = await prisma.ingredient.create({
      data: {
        code: `ING-A-${suffix}`,
        name: `Salmon ${suffix}`,
        unit: 'g',
        currentStock: 100,
        minStock: 10,
        costPrice: 1000,
      },
    });
    const ingB = await prisma.ingredient.create({
      data: {
        code: `ING-B-${suffix}`,
        name: `Rice ${suffix}`,
        unit: 'g',
        currentStock: 100,
        minStock: 10,
        costPrice: 200,
      },
    });
    createdIngredientIds.push(ingA.id, ingB.id);

    await prisma.warehouseStock.createMany({
      data: [
        {
          warehouseId: warehouse.id,
          ingredientId: ingA.id,
          currentStock: 100,
          minStock: 10,
        },
        {
          warehouseId: warehouse.id,
          ingredientId: ingB.id,
          currentStock: 100,
          minStock: 10,
        },
      ],
    });

    const product = await prisma.product.create({
      data: {
        sku: `SKU-LOCK-${suffix}`,
        name: `Lock Roll ${suffix}`,
        sellingPrice: 150000,
        isActive: true,
      },
    });
    createdProductIds.push(product.id);

    await prisma.recipe.create({
      data: {
        productId: product.id,
        isActive: true,
        items: {
          create: [
            { ingredientId: ingA.id, quantity: 30 },
            { ingredientId: ingB.id, quantity: 30 },
          ],
        },
      },
    });

    const order = await prisma.order.create({
      data: {
        code: `ORD-LOCK-${suffix}`,
        branchId: branch.id,
        customerName: 'Concurrency Test',
        customerPhone: '0901234567',
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
        shippingFee: 0,
        totalAmount: 150000,
        accessTokenHash: `hash-${suffix}`,
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              unitPrice: 150000,
              quantity: 1,
              subtotal: 150000,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order.id);

    const adminUser = {
      sub: 'admin-pg',
      email: 'admin@hanbisushi.vn',
      role: 'SUPER_ADMIN',
      branchId: null,
    };

    // Run two concurrent PREPARING transitions on the same order + two manual OUTs
    // Total requested if all succeeded would be: 30 + 30 + 25 + 25 = 110 > 100,
    // and only one PREPARING may succeed while manual OUTs contend on the same rows.
    const outcomes = await Promise.allSettled([
      orderingService.updateOrderStatus(
        order.id,
        OrderStatus.PREPARING,
        'Bếp 1 nhận',
        'KITCHEN_1',
        adminUser,
      ),
      orderingService.updateOrderStatus(
        order.id,
        OrderStatus.PREPARING,
        'Bếp 2 nhận',
        'KITCHEN_2',
        adminUser,
      ),
      inventoryService.createTransaction(
        {
          type: TransactionType.OUT,
          reason: TransactionReason.KITCHEN_USAGE,
          warehouseId: warehouse.id,
          ingredientId: ingA.id,
          quantity: 25,
        },
        adminUser,
      ),
      inventoryService.adjustWarehouseStock(
        warehouse.id,
        ingB.id,
        {
          type: TransactionType.OUT,
          reason: TransactionReason.ADJUSTMENT,
          quantity: 25,
        },
        adminUser,
      ),
    ]);

    // Ensure no PostgreSQL deadlock (40P01) or aborted-transaction errors occurred
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const msg = String(outcome.reason?.message || outcome.reason);
        expect(msg).not.toMatch(
          /deadlock|40P01|current transaction is aborted/i,
        );
      }
    }

    const preparingSuccesses = outcomes
      .slice(0, 2)
      .filter((o) => o.status === 'fulfilled');
    expect(preparingSuccesses).toHaveLength(1);

    const deductions = await prisma.orderRecipeDeduction.findMany({
      where: { orderId: order.id },
    });
    expect(deductions).toHaveLength(1);

    const [wsA, wsB, ingAAfter, ingBAfter] = await Promise.all([
      prisma.warehouseStock.findUnique({
        where: {
          warehouseId_ingredientId: {
            warehouseId: warehouse.id,
            ingredientId: ingA.id,
          },
        },
      }),
      prisma.warehouseStock.findUnique({
        where: {
          warehouseId_ingredientId: {
            warehouseId: warehouse.id,
            ingredientId: ingB.id,
          },
        },
      }),
      prisma.ingredient.findUnique({ where: { id: ingA.id } }),
      prisma.ingredient.findUnique({ where: { id: ingB.id } }),
    ]);

    const manualASucceeded = outcomes[2].status === 'fulfilled' ? 25 : 0;
    const manualBSucceeded = outcomes[3].status === 'fulfilled' ? 25 : 0;

    expect(Number(wsA?.currentStock)).toBe(100 - 30 - manualASucceeded);
    expect(Number(wsB?.currentStock)).toBe(100 - 30 - manualBSucceeded);
    expect(Number(ingAAfter?.currentStock)).toBe(100 - 30 - manualASucceeded);
    expect(Number(ingBAfter?.currentStock)).toBe(100 - 30 - manualBSucceeded);
    expect(Number(wsA?.currentStock)).toBeGreaterThanOrEqual(0);
    expect(Number(wsB?.currentStock)).toBeGreaterThanOrEqual(0);
  }, 20000);

  it('throws ConflictException when concurrent createOrder reuses idempotencyKey with different payload and handles opposing-order recipes without deadlock', async () => {
    const storeConfig = await orderingService.getStoreConfig();
    if (!storeConfig.customerOrderingEnabled) {
      throw new Error('Test requires customerOrderingEnabled=true');
    }

    const suffix = randomUUID().slice(0, 8);
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-OPP-${suffix}`,
        name: `Opposing Warehouse ${suffix}`,
      },
    });
    createdWarehouseIds.push(warehouse.id);

    const branch = await prisma.branch.create({
      data: {
        code: `BR-OPP-${suffix}`,
        name: `Opposing Branch ${suffix}`,
        address: '3 Opp Street',
        phone: '0901234567',
        warehouseId: warehouse.id,
      },
    });
    createdBranchIds.push(branch.id);

    const ingA = await prisma.ingredient.create({
      data: {
        code: `OPP-A-${suffix}`,
        name: `Ing A ${suffix}`,
        unit: 'g',
        currentStock: 100,
        minStock: 10,
        costPrice: 1000,
      },
    });
    const ingB = await prisma.ingredient.create({
      data: {
        code: `OPP-B-${suffix}`,
        name: `Ing B ${suffix}`,
        unit: 'g',
        currentStock: 100,
        minStock: 10,
        costPrice: 1000,
      },
    });
    createdIngredientIds.push(ingA.id, ingB.id);

    await prisma.warehouseStock.createMany({
      data: [
        {
          warehouseId: warehouse.id,
          ingredientId: ingA.id,
          currentStock: 100,
          minStock: 10,
        },
        {
          warehouseId: warehouse.id,
          ingredientId: ingB.id,
          currentStock: 100,
          minStock: 10,
        },
      ],
    });

    const prod1 = await prisma.product.create({
      data: {
        sku: `SKU-OPP1-${suffix}`,
        name: `Opp Roll 1 ${suffix}`,
        sellingPrice: 100000,
        isActive: true,
      },
    });
    const prod2 = await prisma.product.create({
      data: {
        sku: `SKU-OPP2-${suffix}`,
        name: `Opp Roll 2 ${suffix}`,
        sellingPrice: 100000,
        isActive: true,
      },
    });
    createdProductIds.push(prod1.id, prod2.id);

    await prisma.recipe.create({
      data: {
        productId: prod1.id,
        isActive: true,
        items: {
          create: [
            { ingredientId: ingA.id, quantity: 40 },
            { ingredientId: ingB.id, quantity: 40 },
          ],
        },
      },
    });
    await prisma.recipe.create({
      data: {
        productId: prod2.id,
        isActive: true,
        items: {
          create: [
            { ingredientId: ingB.id, quantity: 40 },
            { ingredientId: ingA.id, quantity: 40 },
          ],
        },
      },
    });

    await prisma.shippingRule.create({
      data: {
        branchId: branch.id,
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        fee: 15000,
        isDefault: true,
        isActive: true,
      },
    });

    // 1. Concurrent idempotencyKey conflict on real Postgres
    const conflictKey = `pg-conflict-${suffix}`;
    const conflictOutcomes = await Promise.allSettled([
      orderingService.createOrder({
        customerName: 'User One',
        customerPhone: '0901111111',
        address: '10 Le Loi',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: branch.id,
        idempotencyKey: conflictKey,
        items: [{ productId: prod1.id, quantity: 1 }],
      }),
      orderingService.createOrder({
        customerName: 'User Two',
        customerPhone: '0902222222',
        address: '20 Nguyen Hue',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        branchId: branch.id,
        idempotencyKey: conflictKey,
        items: [{ productId: prod2.id, quantity: 1 }],
      }),
    ]);

    const fulfilled = conflictOutcomes.filter((o) => o.status === 'fulfilled');
    const rejected = conflictOutcomes.filter(
      (o): o is PromiseRejectedResult => o.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const conflictPersisted = await prisma.order.findMany({
      where: { idempotencyKey: conflictKey },
    });
    expect(conflictPersisted).toHaveLength(1);
    createdOrderIds.push(...conflictPersisted.map((o) => o.id));

    // 2. Two distinct confirmed orders with opposite recipe item order + manual OUTs
    const order1 = await prisma.order.create({
      data: {
        code: `ORD-OPP1-${suffix}`,
        branchId: branch.id,
        customerName: 'Opp 1',
        customerPhone: '0901234567',
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
        shippingFee: 0,
        totalAmount: 100000,
        accessTokenHash: `hash-opp1-${suffix}`,
        items: {
          create: [
            {
              productId: prod1.id,
              productName: prod1.name,
              unitPrice: 100000,
              quantity: 1,
              subtotal: 100000,
            },
          ],
        },
      },
    });
    const order2 = await prisma.order.create({
      data: {
        code: `ORD-OPP2-${suffix}`,
        branchId: branch.id,
        customerName: 'Opp 2',
        customerPhone: '0901234567',
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
        shippingFee: 0,
        totalAmount: 100000,
        accessTokenHash: `hash-opp2-${suffix}`,
        items: {
          create: [
            {
              productId: prod2.id,
              productName: prod2.name,
              unitPrice: 100000,
              quantity: 1,
              subtotal: 100000,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order1.id, order2.id);

    const adminUser = {
      sub: 'admin-opp',
      email: 'admin@hanbisushi.vn',
      role: 'SUPER_ADMIN',
      branchId: null,
    };

    const stockOutcomes = await Promise.allSettled([
      orderingService.updateOrderStatus(
        order1.id,
        OrderStatus.PREPARING,
        'Bếp 1',
        'KITCHEN_1',
        adminUser,
      ),
      orderingService.updateOrderStatus(
        order2.id,
        OrderStatus.PREPARING,
        'Bếp 2',
        'KITCHEN_2',
        adminUser,
      ),
      inventoryService.createTransaction(
        {
          type: TransactionType.OUT,
          reason: TransactionReason.KITCHEN_USAGE,
          warehouseId: warehouse.id,
          ingredientId: ingB.id,
          quantity: 15,
        },
        adminUser,
      ),
      inventoryService.adjustWarehouseStock(
        warehouse.id,
        ingA.id,
        {
          type: TransactionType.OUT,
          reason: TransactionReason.ADJUSTMENT,
          quantity: 15,
        },
        adminUser,
      ),
    ]);

    for (const outcome of stockOutcomes) {
      if (outcome.status === 'rejected') {
        const msg = String(outcome.reason?.message || outcome.reason);
        expect(msg).not.toMatch(
          /deadlock|40P01|current transaction is aborted/i,
        );
      }
    }

    const [wsA, wsB] = await Promise.all([
      prisma.warehouseStock.findUnique({
        where: {
          warehouseId_ingredientId: {
            warehouseId: warehouse.id,
            ingredientId: ingA.id,
          },
        },
      }),
      prisma.warehouseStock.findUnique({
        where: {
          warehouseId_ingredientId: {
            warehouseId: warehouse.id,
            ingredientId: ingB.id,
          },
        },
      }),
    ]);

    const order1Ok = stockOutcomes[0].status === 'fulfilled' ? 40 : 0;
    const order2Ok = stockOutcomes[1].status === 'fulfilled' ? 40 : 0;
    const manualBOk = stockOutcomes[2].status === 'fulfilled' ? 15 : 0;
    const manualAOk = stockOutcomes[3].status === 'fulfilled' ? 15 : 0;

    expect(Number(wsA?.currentStock)).toBe(
      100 - order1Ok - order2Ok - manualAOk,
    );
    expect(Number(wsB?.currentStock)).toBe(
      100 - order1Ok - order2Ok - manualBOk,
    );
    expect(Number(wsA?.currentStock)).toBeGreaterThanOrEqual(0);
    expect(Number(wsB?.currentStock)).toBeGreaterThanOrEqual(0);
  }, 20000);
});
