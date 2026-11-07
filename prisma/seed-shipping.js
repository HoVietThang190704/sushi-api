const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Danh sách các Phường/Xã chuẩn TP.HCM theo Nghị quyết 1685/NQ-UBTVQH15
const HCM_OFFICIAL_WARDS_SEED = [
  // Chi nhánh 1: HANBI-Q1 (Trụ sở chính Quận 1)
  { district: 'Khu vực 1 (Quận 1 cũ)', ward: 'Phường Sài Gòn', branchCode: 'HANBI-Q1', fee: 15000, isDefault: true },
  { district: 'Khu vực 1 (Quận 1 cũ)', ward: 'Phường Bến Thành', branchCode: 'HANBI-Q1', fee: 15000, isDefault: true },
  { district: 'Khu vực 1 (Quận 1 cũ)', ward: 'Phường Tân Định', branchCode: 'HANBI-Q1', fee: 18000, isDefault: true },
  { district: 'Khu vực 1 (Quận 1 cũ)', ward: 'Phường Cầu Ông Lãnh', branchCode: 'HANBI-Q1', fee: 18000, isDefault: true },
  { district: 'Khu vực 3 (Quận 3 cũ)', ward: 'Phường Bàn Cờ', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },
  { district: 'Khu vực 3 (Quận 3 cũ)', ward: 'Phường Xuân Hòa', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },
  { district: 'Khu vực 3 (Quận 3 cũ)', ward: 'Phường Nhiêu Lộc', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Khu vực 4 (Quận 4 cũ)', ward: 'Phường Xóm Chiếu', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },
  { district: 'Khu vực 4 (Quận 4 cũ)', ward: 'Phường Khánh Hội', branchCode: 'HANBI-Q1', fee: 20000, isDefault: true },
  { district: 'Khu vực 4 (Quận 4 cũ)', ward: 'Phường Vĩnh Hội', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Khu vực 5 (Quận 5 cũ)', ward: 'Phường Chợ Quán', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Khu vực 5 (Quận 5 cũ)', ward: 'Phường An Đông', branchCode: 'HANBI-Q1', fee: 25000, isDefault: true },
  { district: 'Khu vực 10 (Quận 10 cũ)', ward: 'Phường Diên Hồng', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Khu vực 10 (Quận 10 cũ)', ward: 'Phường Vườn Lài', branchCode: 'HANBI-Q1', fee: 22000, isDefault: true },
  { district: 'Khu vực 10 (Quận 10 cũ)', ward: 'Phường Hòa Hưng', branchCode: 'HANBI-Q1', fee: 25000, isDefault: true },

  // Chi nhánh 2: HANBI-BT (Bình Thạnh)
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Thạnh Mỹ Tây', branchCode: 'HANBI-BT', fee: 15000, isDefault: true },
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Gia Định', branchCode: 'HANBI-BT', fee: 18000, isDefault: true },
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Bình Thạnh', branchCode: 'HANBI-BT', fee: 18000, isDefault: true },
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Bình Lợi Trung', branchCode: 'HANBI-BT', fee: 20000, isDefault: true },
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Bình Quới', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },
  { district: 'Khu vực TP. Thủ Đức', ward: 'Phường An Khánh', branchCode: 'HANBI-BT', fee: 25000, isDefault: true },
  { district: 'Khu vực TP. Thủ Đức', ward: 'Phường Thủ Đức', branchCode: 'HANBI-BT', fee: 28000, isDefault: true },
  { district: 'Khu vực TP. Thủ Đức', ward: 'Phường Phước Long', branchCode: 'HANBI-BT', fee: 28000, isDefault: true },
  { district: 'Khu vực Phú Nhuận (cũ)', ward: 'Phường Cầu Kiệu', branchCode: 'HANBI-BT', fee: 20000, isDefault: true },
  { district: 'Khu vực Phú Nhuận (cũ)', ward: 'Phường Đức Nhuận', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },
  { district: 'Khu vực Gò Vấp (cũ)', ward: 'Phường Hạnh Thông', branchCode: 'HANBI-BT', fee: 22000, isDefault: true },
  { district: 'Khu vực Gò Vấp (cũ)', ward: 'Phường An Nhơn', branchCode: 'HANBI-BT', fee: 25000, isDefault: true },

  // Giao chéo nhiều chi nhánh (cho phép đổi chi nhánh):
  { district: 'Khu vực Bình Thạnh (cũ)', ward: 'Phường Gia Định', branchCode: 'HANBI-Q1', fee: 22000, isDefault: false },
  { district: 'Khu vực TP. Thủ Đức', ward: 'Phường An Khánh', branchCode: 'HANBI-Q1', fee: 28000, isDefault: false },

  // Chi nhánh 3: HANBI-Q7 (Quận 7)
  { district: 'Khu vực 7 (Quận 7 cũ)', ward: 'Phường Tân Mỹ', branchCode: 'HANBI-Q7', fee: 15000, isDefault: true },
  { district: 'Khu vực 7 (Quận 7 cũ)', ward: 'Phường Tân Hưng', branchCode: 'HANBI-Q7', fee: 18000, isDefault: true },
  { district: 'Khu vực 7 (Quận 7 cũ)', ward: 'Phường Tân Thuận', branchCode: 'HANBI-Q7', fee: 18000, isDefault: true },
  { district: 'Khu vực 7 (Quận 7 cũ)', ward: 'Phường Phú Thuận', branchCode: 'HANBI-Q7', fee: 20000, isDefault: true },
  { district: 'Khu vực 8 (Quận 8 cũ)', ward: 'Phường Chánh Hưng', branchCode: 'HANBI-Q7', fee: 22000, isDefault: true },
  { district: 'Khu vực 8 (Quận 8 cũ)', ward: 'Phường Phú Định', branchCode: 'HANBI-Q7', fee: 25000, isDefault: true },
  { district: 'Khu vực 8 (Quận 8 cũ)', ward: 'Phường Bình Đông', branchCode: 'HANBI-Q7', fee: 25000, isDefault: true },
  { district: 'Khu vực 4 (Quận 4 cũ)', ward: 'Phường Xóm Chiếu', branchCode: 'HANBI-Q7', fee: 22000, isDefault: false },
];

async function seedShippingRules() {
  console.log('Seeding official 2025-2026 HCM shipping rules...');

  const branches = await prisma.branch.findMany();
  const branchMap = new Map(branches.map((b) => [b.code, b.id]));

  for (const rule of HCM_OFFICIAL_WARDS_SEED) {
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

  console.log(`Seeded ${HCM_OFFICIAL_WARDS_SEED.length} official shipping rules successfully.`);
}

seedShippingRules()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
