const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding staff users, demo orders & store config...');

  // 1. Store Config & Payment Config
  await prisma.storeConfig.upsert({
    where: { key: 'DEFAULT' },
    update: {},
    create: {
      key: 'DEFAULT',
      customerOrderingEnabled: true,
      contactPhone: '0988888888',
    },
  });

  await prisma.paymentConfig.upsert({
    where: { key: 'DEFAULT' },
    update: {},
    create: {
      key: 'DEFAULT',
      bankName: 'MB Bank',
      accountNumber: '999988886666',
      accountHolder: 'HANBI SUSHI COMPANY',
      transferSyntax: 'HANBI',
      note: 'Vui lòng ghi đúng cú pháp chuyển khoản để hệ thống tự động xác nhận đơn hàng',
      isActive: true,
    },
  });
  console.log('✔ Store config & Payment config seeded.');

  // 2. Staff Accounts (Mật khẩu chung cho môi trường dev: 'admin123456')
  const defaultPasswordHash = await bcrypt.hash('admin123456', 10);
  const branches = await prisma.branch.findMany({ orderBy: { code: 'asc' } });
  const b1 = branches[0];
  const b2 = branches[1] || branches[0];

  const staffUsers = [
    {
      email: 'admin@sushi.com',
      fullName: 'Nguyễn Quản Trị Viên (Super Admin)',
      role: 'SUPER_ADMIN',
      branchId: null,
      phone: '0901111222',
      mustChangePassword: false,
    },
    {
      email: 'manager.q1@sushi.com',
      fullName: 'Trần Văn Quản Lý (Quận 1)',
      role: 'BRANCH_MANAGER',
      branchId: b1?.id || null,
      phone: '0902222333',
      mustChangePassword: false,
    },
    {
      email: 'cashier.q1@sushi.com',
      fullName: 'Lê Thị Thu Ngân (Quận 1)',
      role: 'CASHIER',
      branchId: b1?.id || null,
      phone: '0903333444',
      mustChangePassword: false,
    },
    {
      email: 'kitchen.q1@sushi.com',
      fullName: 'Phạm Văn Đầu Bếp (Quận 1)',
      role: 'KITCHEN_STAFF',
      branchId: b1?.id || null,
      phone: '0904444555',
      mustChangePassword: false,
    },
    {
      email: 'manager.bt@sushi.com',
      fullName: 'Hoàng Thị Quản Lý (Bình Thạnh)',
      role: 'BRANCH_MANAGER',
      branchId: b2?.id || null,
      phone: '0905555666',
      mustChangePassword: false,
    },
  ];

  for (const u of staffUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        role: u.role,
        branchId: u.branchId,
        isActive: true,
        phone: u.phone,
        passwordHash: defaultPasswordHash,
      },
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash: defaultPasswordHash,
        role: u.role,
        branchId: u.branchId,
        phone: u.phone,
        isActive: true,
        mustChangePassword: u.mustChangePassword,
      },
    });
    console.log(`  ✔ [${u.role}] ${u.email}`);
  }

  // 3. Demo Orders với đa dạng trạng thái (PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP, DELIVERING, COMPLETED)
  const products = await prisma.product.findMany({ take: 8 });
  if (products.length >= 2 && b1) {
    const ordersCount = await prisma.order.count();
    if (ordersCount === 0) {
      console.log('Seeding demo orders for testing order workflow & dashboard...');

      const mockOrders = [
        {
          code: 'ORD-20261119-001',
          customerName: 'Nguyễn Thị Minh An',
          customerPhone: '0912345678',
          customerEmail: 'minhan@gmail.com',
          address: '15/2 Lê Thánh Tôn',
          district: 'Khu vực 1 (Quận 1 cũ)',
          ward: 'Phường Bến Thành',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentMethod: 'CASH',
          shippingFee: 15000,
          items: [
            { product: products[0], qty: 2 },
            { product: products[1], qty: 1 },
          ],
        },
        {
          code: 'ORD-20261119-002',
          customerName: 'Trần Bảo Long',
          customerPhone: '0987654321',
          customerEmail: 'baolong.tran@yahoo.com',
          address: '45 Pasteur',
          district: 'Khu vực 1 (Quận 1 cũ)',
          ward: 'Phường Sài Gòn',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paymentMethod: 'BANK_TRANSFER',
          shippingFee: 15000,
          items: [
            { product: products[2] || products[0], qty: 1 },
            { product: products[3] || products[1], qty: 2 },
          ],
        },
        {
          code: 'ORD-20261119-003',
          customerName: 'Hoàng Kim Yến',
          customerPhone: '0933445566',
          customerEmail: 'kimyen.hoang@gmail.com',
          address: '120 Nguyễn Huệ',
          district: 'Khu vực 1 (Quận 1 cũ)',
          ward: 'Phường Bến Thành',
          status: 'PREPARING',
          paymentStatus: 'PAID',
          paymentMethod: 'BANK_TRANSFER',
          shippingFee: 15000,
          items: [
            { product: products[0], qty: 3 },
          ],
        },
        {
          code: 'ORD-20261119-004',
          customerName: 'Lê Hoàng Nam',
          customerPhone: '0977889900',
          customerEmail: 'nam.le@gmail.com',
          address: '72 Hai Bà Trưng',
          district: 'Khu vực 1 (Quận 1 cũ)',
          ward: 'Phường Tân Định',
          status: 'READY_FOR_PICKUP',
          paymentStatus: 'PAID',
          paymentMethod: 'BANK_TRANSFER',
          shippingFee: 18000,
          items: [
            { product: products[1], qty: 2 },
          ],
        },
        {
          code: 'ORD-20261119-005',
          customerName: 'Phạm Thu Hằng',
          customerPhone: '0944556677',
          customerEmail: 'hang.pham@gmail.com',
          address: '88 Nguyễn Gia Trí, Phường 25',
          district: 'Khu vực Bình Thạnh (cũ)',
          ward: 'Phường Thạnh Mỹ Tây',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          shippingFee: 15000,
          items: [
            { product: products[0], qty: 1 },
            { product: products[1], qty: 1 },
          ],
        },
      ];

      for (const o of mockOrders) {
        let subtotal = 0;
        const orderItemsData = o.items.map((i) => {
          const price = Number(i.product.sellingPrice);
          const lineTotal = price * i.qty;
          subtotal += lineTotal;
          return {
            productId: i.product.id,
            productName: i.product.name,
            unitPrice: price,
            quantity: i.qty,
            subtotal: lineTotal,
          };
        });

        const totalAmount = subtotal + o.shippingFee;

        await prisma.order.create({
          data: {
            code: o.code,
            branchId: b1.id,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            customerEmail: o.customerEmail,
            address: o.address,
            province: 'TP. Hồ Chí Minh',
            district: o.district,
            ward: o.ward,
            status: o.status,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            shippingFee: o.shippingFee,
            totalAmount: totalAmount,
            accessTokenHash: 'seeded-demo-token-hash-' + o.code,
            items: {
              create: orderItemsData,
            },
            statusHistories: {
              create: [
                {
                  fromStatus: null,
                  toStatus: 'PENDING',
                  reason: 'Khách hàng đặt đơn thành công từ Storefront',
                  changedBy: 'CUSTOMER',
                },
              ],
            },
          },
        });
        console.log(`  ✔ Order created: [${o.status}] ${o.code} - ${o.customerName}`);
      }
    }
  }

  console.log('✨ All seed data created successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
