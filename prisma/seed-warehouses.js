const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Seeding default warehouses and branch mapping...');

  // 1. Tạo kho tổng trung tâm mặc định
  const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000101';
  const warehouse = await prisma.warehouse.upsert({
    where: { id: DEFAULT_WAREHOUSE_ID },
    update: {},
    create: {
      id: DEFAULT_WAREHOUSE_ID,
      code: 'KHO-TONG-HCM',
      name: 'Kho Tổng Bếp Trung Tâm TP.HCM',
      address: 'Số 10 Mai Chí Thọ, An Phú, TP. Thủ Đức, TP.HCM',
      isActive: true,
    },
  });
  console.log('Default warehouse:', warehouse.code);

  // 2. Gán kho mặc định cho tất cả các chi nhánh hiện có chưa có kho
  const updatedBranches = await prisma.branch.updateMany({
    where: { warehouseId: null },
    data: { warehouseId: DEFAULT_WAREHOUSE_ID },
  });
  console.log(`Updated ${updatedBranches.count} branches with default warehouse.`);

  // 3. Khởi tạo warehouse_stocks cho tất cả ingredients hiện có trong kho tổng
  const ingredients = await prisma.ingredient.findMany();
  for (const ing of ingredients) {
    await prisma.warehouseStock.upsert({
      where: {
        warehouseId_ingredientId: {
          warehouseId: DEFAULT_WAREHOUSE_ID,
          ingredientId: ing.id,
        },
      },
      update: {},
      create: {
        warehouseId: DEFAULT_WAREHOUSE_ID,
        ingredientId: ing.id,
        currentStock: ing.currentStock || 1000,
        minStock: ing.minStock || 10,
      },
    });
  }
  console.log(`Seeded warehouse stocks for ${ingredients.length} ingredients.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
