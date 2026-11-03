const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient, ProductType } = require('@prisma/client');

const prisma = new PrismaClient();

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('Connecting to database...');

  // 1. Ensure categories exist
  const categoriesToEnsure = [
    { name: 'Sashimi' },
    { name: 'Nigiri' },
    { name: 'Roll' },
    { name: 'Roll Platter' },
    { name: 'Entrée' },
    { name: 'Cơm & Mì' },
    { name: 'Đồ uống & Tráng miệng' },
  ];

  const categoryMap = {};

  for (const cat of categoriesToEnsure) {
    let existing = await prisma.productCategory.findFirst({
      where: {
        name: { equals: cat.name, mode: 'insensitive' },
      },
    });

    if (!existing) {
      existing = await prisma.productCategory.create({
        data: { name: cat.name },
      });
      console.log(`Created category: ${cat.name} (${existing.id})`);
    } else {
      console.log(`Found category: ${cat.name} (${existing.id})`);
    }

    categoryMap[cat.name] = existing.id;
  }

  // 2. Define products list
  const productsToSeed = [
    // --- SASHIMI ---
    {
      sku: 'SAS-SALMON-6PC',
      name: 'Sashimi Cá Hồi Na Uy (6 miếng)',
      categoryName: 'Sashimi',
      type: ProductType.SINGLE,
      sellingPrice: 139000,
      imageUrl:
        'https://images.unsplash.com/photo-1534482421-64566f976cfa?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'SAS-TAKO-4PC',
      name: 'Sashimi Bạch Tuộc Nhật Bản (4 miếng)',
      categoryName: 'Sashimi',
      type: ProductType.SINGLE,
      sellingPrice: 95000,
      imageUrl:
        'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'SAS-HOKKIGAI-4PC',
      name: 'Sashimi Sò Đỏ Tươi Sống (4 miếng)',
      categoryName: 'Sashimi',
      type: ProductType.SINGLE,
      sellingPrice: 99000,
      imageUrl:
        'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80',
    },

    // --- NIGIRI & GUNKAN ---
    {
      sku: 'NIG-SALMON',
      name: 'Sushi Nigiri Cá Hồi Tươi',
      categoryName: 'Nigiri',
      type: ProductType.SINGLE,
      sellingPrice: 39000,
      imageUrl:
        'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'NIG-EBI',
      name: 'Sushi Nigiri Tôm Luộc Ebi',
      categoryName: 'Nigiri',
      type: ProductType.SINGLE,
      sellingPrice: 33000,
      imageUrl:
        'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'NIG-UNAGI',
      name: 'Sushi Nigiri Lươn Nhật Nướng',
      categoryName: 'Nigiri',
      type: ProductType.SINGLE,
      sellingPrice: 49000,
      imageUrl:
        'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'GUK-TOBIKO',
      name: 'Gunkan Trứng Cua Cam Giòn',
      categoryName: 'Nigiri',
      type: ProductType.SINGLE,
      sellingPrice: 35000,
      imageUrl:
        'https://images.unsplash.com/photo-1562802378-063ec186a863?auto=format&fit=crop&w=800&q=80',
    },

    // --- ROLL ---
    {
      sku: 'ROL-SALMON-AVO',
      name: 'Cơm Cuộn Cá Hồi Quả Bơ (Salmon Avocado Roll)',
      categoryName: 'Roll',
      type: ProductType.SINGLE,
      sellingPrice: 79000,
      imageUrl:
        'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'ROL-EBI-TEMPURA',
      name: 'Cơm Cuộn Tôm Chiên Giòn Tempura Roll',
      categoryName: 'Roll',
      type: ProductType.SINGLE,
      sellingPrice: 89000,
      imageUrl:
        'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'ROL-DRAGON-UNAGI',
      name: 'Cơm Cuộn Rồng Lươn Nhật Đặc Biệt',
      categoryName: 'Roll',
      type: ProductType.SINGLE,
      sellingPrice: 199000,
      imageUrl:
        'https://images.unsplash.com/photo-1617196035154-1e7e6e28b0db?auto=format&fit=crop&w=800&q=80',
    },

    // --- ROLL PLATTER / COMBO ---
    {
      sku: 'SET-SALMON-10PC',
      name: 'Set Sushi & Sashimi Cá Hồi Toàn Diện (10 món)',
      categoryName: 'Roll Platter',
      type: ProductType.COMBO,
      sellingPrice: 189000,
      imageUrl:
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'SET-FAMILY-16PC',
      name: 'Set Sushi Gia Đình Thượng Hạng (Family Platter 16 viên)',
      categoryName: 'Roll Platter',
      type: ProductType.COMBO,
      sellingPrice: 289000,
      imageUrl:
        'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80',
    },

    // --- ENTRÉE & MÓN NƯỚNG ---
    {
      sku: 'ENT-UNAGI-TERI',
      name: 'Lươn Nhật Nướng Sốt Teriyaki Truyền Thống',
      categoryName: 'Entrée',
      type: ProductType.SINGLE,
      sellingPrice: 169000,
      imageUrl:
        'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'ENT-MISO-SOUP',
      name: 'Súp Miso Rong Biển Đậu Hũ Thanh Nhẹ',
      categoryName: 'Entrée',
      type: ProductType.SINGLE,
      sellingPrice: 17000,
      imageUrl:
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80',
    },

    // --- CƠM & MÌ NHẬT ---
    {
      sku: 'NOO-BEEF-UDON',
      name: 'Mì Udon Nóng Bò Mỹ Thượng Hạng',
      categoryName: 'Cơm & Mì',
      type: ProductType.SINGLE,
      sellingPrice: 99000,
      imageUrl:
        'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'NOO-MISO-RAMEN',
      name: 'Mì Ramen Thịt Chashu Nước Dùng Miso Đậm Đà',
      categoryName: 'Cơm & Mì',
      type: ProductType.SINGLE,
      sellingPrice: 129000,
      imageUrl:
        'https://images.unsplash.com/photo-1591814468924-caf88d1232e1?auto=format&fit=crop&w=800&q=80',
    },

    // --- ĐỒ UỐNG & TRÁNG MIỆNG ---
    {
      sku: 'DRK-GENMAICHA',
      name: 'Trà Xanh Gạo Rang Genmaicha Nhật Bản (Ấm)',
      categoryName: 'Đồ uống & Tráng miệng',
      type: ProductType.SINGLE,
      sellingPrice: 29000,
      imageUrl:
        'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80',
    },
    {
      sku: 'DES-MATCHA-MOCHI',
      name: 'Bánh Mochi Matcha Đậu Đỏ Dẻo Thơm (2 viên)',
      categoryName: 'Đồ uống & Tráng miệng',
      type: ProductType.SINGLE,
      sellingPrice: 35000,
      imageUrl:
        'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&q=80',
    },
  ];

  console.log(`Starting upsert for ${productsToSeed.length} products...`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of productsToSeed) {
    const categoryId = categoryMap[item.categoryName];

    const slug = toSlug(item.name);
    const res = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        slug: slug,
        type: item.type,
        categoryId: categoryId,
        sellingPrice: item.sellingPrice,
        imageUrl: item.imageUrl,
        isActive: true,
      },
      create: {
        sku: item.sku,
        slug: slug,
        name: item.name,
        type: item.type,
        categoryId: categoryId,
        sellingPrice: item.sellingPrice,
        imageUrl: item.imageUrl,
        isActive: true,
      },
    });

    console.log(`✔ [${res.sku}] ${res.name} -> ${res.sellingPrice.toString()} VND`);
  }

  // Count total products in database
  const total = await prisma.product.count({ where: { isActive: true } });
  console.log(`\nDone! Total active products in database: ${total}`);
}

main()
  .catch((err) => {
    console.error('Error seeding products:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
