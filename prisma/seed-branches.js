const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const DEFAULT_BRANCH_ID = '00000000-0000-0000-0000-000000000001';
  
  // 1. Tạo chi nhánh mặc định trước
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ordering.branches (
      id UUID PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(30) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO ordering.branches (id, code, name, address, phone, is_active, created_at, updated_at)
    VALUES ('${DEFAULT_BRANCH_ID}', 'HANBI-Q1', 'Hanbi Sushi Quận 1 (Trụ Sở Chính)', 'Số 12 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM', '0901234567', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
  `);

  // Thêm chi nhánh 2 và 3
  await prisma.$executeRawUnsafe(`
    INSERT INTO ordering.branches (id, code, name, address, phone, is_active, created_at, updated_at)
    VALUES 
    ('00000000-0000-0000-0000-000000000002', 'HANBI-BT', 'Hanbi Sushi Bình Thạnh', 'Số 45 Nguyễn Gia Trí, Phường 25, Bình Thạnh, TP.HCM', '0907654321', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-0000-0000-000000000003', 'HANBI-Q7', 'Hanbi Sushi Quận 7', 'Số 88 Nguyễn Thị Thập, Tân Phú, Quận 7, TP.HCM', '0909888999', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
  `);

  // Cập nhật các đơn hàng cũ sang default branch id hợp lệ
  await prisma.$executeRawUnsafe(`
    UPDATE ordering.orders 
    SET branch_id = '${DEFAULT_BRANCH_ID}'
    WHERE branch_id NOT IN (SELECT id FROM ordering.branches);
  `);

  console.log('Branches seeded and existing orders updated successfully.');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
