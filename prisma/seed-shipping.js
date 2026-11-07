const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Danh sách các Xã/Phường mẫu tại các Quận trọng điểm TP.HCM
const HCM_WARDS_SEED = [
  // Quận 1 (gần chi nhánh Q1)
  { district: 'Quận 1', ward: 'Phường Bến Nghé', branchCode: 'HANBI-Q1', fee: 15000, isDefault: true },
  { district: 'Quận 1', ward: 'Phường Bến Thành', branchCode: 'HANBI-Q1', fee: 15000, isDefault: true },
  { district: 'Quận 1', ward: 'Phường Đa Kao', branchCode: 'HANBI-Q1', fee: 18000, isDefault: true },
  { district: 'Quận 1', ward: 'Phường Tân Định', branchCode: 'HANBI-Q1', fee: 18000, isDefault: true },
  { district: 'Quận 1', ward: 'Phường Phạm Ngũ Lão', branchCode: 'HANBI-Q1', fee: 18000, isDefault: true },
  { district: 'Quận 1', ward: 'Phường Nguyễn Cư Trinh', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },

  // Quận 3 (giao từ Q1)
  { district: 'Quận 3', ward: 'Phường Võ Thị Sáu', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },
  { district: 'Quận 3', ward: 'Phường 1', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Quận 3', ward: 'Phường 2', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Quận 3', ward: 'Phường 3', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Quận 3', ward: 'Phường 4', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Quận 3', ward: 'Phường 9', branchCode: 'HANBI-Q1', fee: 25000, isDefault: true },

  // Quận Bình Thạnh (gần chi nhánh Bình Thạnh)
  { district: 'Quận Bình Thạnh', ward: 'Phường 25', branchCode: 'HANBI-BT', fee: 15000, isDefault: true },
  { district: 'Quận Bình Thạnh', ward: 'Phường 19', branchCode: 'HANBI-BT', fee: 18000, isDefault: true },
  { district: 'Quận Bình Thạnh', ward: 'Phường 21', branchCode: 'HANBI-BT', fee: 18000, isDefault: true },
  { district: 'Quận Bình Thạnh', ward: 'Phường 22', branchCode: 'HANBI-BT', fee: 18000, isDefault: true },
  { district: 'Quận Bình Thạnh', ward: 'Phường 26', branchCode: 'HANBI-BT', fee: 20000, isDefault: true },
  { district: 'Quận Bình Thạnh', ward: 'Phường 12', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },

  // Quận Phú Nhuận (giao từ chi nhánh Bình Thạnh hoặc Q1)
  { district: 'Quận Phú Nhuận', ward: 'Phường 1', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },
  { district: 'Quận Phú Nhuận', ward: 'Phường 2', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },
  { district: 'Quận Phú Nhuận', ward: 'Phường 7', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },

  // Quận 7 (gần chi nhánh Quận 7)
  { district: 'Quận 7', ward: 'Phường Tân Phú', branchCode: 'HANBI-Q7', fee: 15000, isDefault: true },
  { district: 'Quận 7', ward: 'Phường Tân Phong (Phú Mỹ Hưng)', branchCode: 'HANBI-Q7', fee: 18000, isDefault: true },
  { district: 'Quận 7', ward: 'Phường Tân Quy', branchCode: 'HANBI-Q7', fee: 18000, isDefault: true },
  { district: 'Quận 7', ward: 'Phường Tân Kiểng', branchCode: 'HANBI-Q7', fee: 20000, isDefault: true },

  // TP. Thủ Đức (Khu vực Thảo Điền, An Phú)
  { district: 'TP. Thủ Đức', ward: 'Phường Thảo Điền', branchCode: 'HANBI-BT', fee: 25000, isDefault: true },
  { district: 'TP. Thủ Đức', ward: 'Phường An Phú', branchCode: 'HANBI-BT', fee: 28000, isDefault: true },
  { district: 'TP. Thủ Đức', ward: 'Phường Bình An', branchCode: 'HANBI-BT', fee: 25000, isDefault: true },
];

async function seedShippingRules() {
  console.log('Seeding shipping rules for Ho Chi Minh City...');

  // Lấy map branchCode -> branchId
  const branches = await prisma.branch.findMany();
  const branchMap = new Map(branches.map((b) => [b.code, b.id]));

  for (const rule of HCM_WARDS_SEED) {
    const branchId = branchMap.get(rule.branchCode);
    if (!branchId) {
      console.warn(`Branch with code ${rule.branchCode} not found!`);
      continue;
    }

    await prisma.shippingRule.upsert({
      where: {
        branchId_district_ward: {
          branchId,
          district: rule.district,
          ward: rule.ward,
        },
      },
      update: {
        fee: rule.fee,
        isDefault: rule.isDefault,
        isActive: true,
      },
      create: {
        branchId,
        province: 'TP. Hồ Chí Minh',
        district: rule.district,
        ward: rule.ward,
        fee: rule.fee,
        isDefault: rule.isDefault,
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${HCM_WARDS_SEED.length} shipping rules successfully.`);
}

seedShippingRules()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
