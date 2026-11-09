const { PrismaClient, ProductType } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000101';

// 1. Danh sách nguyên liệu chuẩn ẩm thực Nhật Bản
const INGREDIENTS = [
  // --- Hải sản & Thịt tươi sống ---
  {
    code: 'NL-CA-HOI',
    name: 'Cá hồi Na Uy phi lê tươi',
    unit: 'g',
    costPrice: 450, // 450.000đ/kg
    initialStock: 25000, // 25kg
    minStock: 3000,
  },
  {
    code: 'NL-BACH-TUOC',
    name: 'Bạch tuộc Nhật Tako luộc chuẩn sashimi',
    unit: 'g',
    costPrice: 400, // 400.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 2000,
  },
  {
    code: 'NL-SO-DO',
    name: 'Sò đỏ Nhật Hokkigai tươi',
    unit: 'g',
    costPrice: 550, // 550.000đ/kg
    initialStock: 12000, // 12kg
    minStock: 1500,
  },
  {
    code: 'NL-TOM-EBI',
    name: 'Tôm luộc bướm Ebi Sushi',
    unit: 'con',
    costPrice: 6000, // 6.000đ/con
    initialStock: 1000,
    minStock: 100,
  },
  {
    code: 'NL-LUON-NHAT',
    name: 'Lươn Nhật nướng sốt Kabayaki (Unagi)',
    unit: 'g',
    costPrice: 650, // 650.000đ/kg
    initialStock: 20000, // 20kg
    minStock: 2000,
  },
  {
    code: 'NL-TRUNG-CUA',
    name: 'Trứng cua Tobiko cam giòn',
    unit: 'g',
    costPrice: 500, // 500.000đ/kg
    initialStock: 10000, // 10kg
    minStock: 1000,
  },
  {
    code: 'NL-TOM-TEMPURA',
    name: 'Tôm chiên giòn Tempura',
    unit: 'con',
    costPrice: 10000, // 10.000đ/con
    initialStock: 600,
    minStock: 50,
  },
  {
    code: 'NL-BO-MY',
    name: 'Thịt ba chỉ bò Mỹ bào lát',
    unit: 'g',
    costPrice: 280, // 280.000đ/kg
    initialStock: 30000, // 30kg
    minStock: 4000,
  },
  {
    code: 'NL-THIT-CHASHU',
    name: 'Thịt heo Chashu cuộn kiểu Nhật',
    unit: 'g',
    costPrice: 320, // 320.000đ/kg
    initialStock: 20000, // 20kg
    minStock: 2000,
  },
  {
    code: 'NL-TRUNG-TAMAGO',
    name: 'Trứng ngâm tương lòng đào Nhật',
    unit: 'quả',
    costPrice: 6000, // 6.000đ/quả
    initialStock: 400,
    minStock: 40,
  },

  // --- Cơm, Mì & Bột ---
  {
    code: 'NL-COM-SUSHI',
    name: 'Cơm giấm Sushi Shari nấu chín',
    unit: 'g',
    costPrice: 35, // 35.000đ/kg
    initialStock: 80000, // 80kg
    minStock: 10000,
  },
  {
    code: 'NL-MI-UDON',
    name: 'Mì Udon tươi Sanuki',
    unit: 'g',
    costPrice: 60, // 60.000đ/kg
    initialStock: 40000, // 40kg
    minStock: 5000,
  },
  {
    code: 'NL-MI-RAMEN',
    name: 'Mì Ramen sợi xoăn tươi',
    unit: 'g',
    costPrice: 70, // 70.000đ/kg
    initialStock: 30000, // 30kg
    minStock: 4000,
  },

  // --- Nước dùng, Sốt & Gia vị Nhật ---
  {
    code: 'NL-NUOC-DASHI',
    name: 'Nước dùng Dashi cá ngừ & tảo bẹ',
    unit: 'ml',
    costPrice: 20, // 20.000đ/lít
    initialStock: 100000, // 100 lít
    minStock: 15000,
  },
  {
    code: 'NL-NUOC-RAMEN-MISO',
    name: 'Nước cốt hầm Ramen Miso đậm đà',
    unit: 'ml',
    costPrice: 45, // 45.000đ/lít
    initialStock: 80000, // 80 lít
    minStock: 10000,
  },
  {
    code: 'NL-TUONG-MISO',
    name: 'Tương đậu nành Miso Nhật Bản',
    unit: 'g',
    costPrice: 150, // 150.000đ/kg
    initialStock: 25000, // 25kg
    minStock: 3000,
  },
  {
    code: 'NL-SOT-UNAGI',
    name: 'Sốt lươn Nhật Unagi Tare',
    unit: 'ml',
    costPrice: 150, // 150.000đ/lít
    initialStock: 15000, // 15 lít
    minStock: 2000,
  },
  {
    code: 'NL-SOT-TERIYAKI',
    name: 'Sốt Teriyaki truyền thống',
    unit: 'ml',
    costPrice: 120, // 120.000đ/lít
    initialStock: 20000, // 20 lít
    minStock: 2000,
  },
  {
    code: 'NL-SOT-MAYO',
    name: 'Xốt Mayonnaise Kewpie Nhật',
    unit: 'g',
    costPrice: 100, // 100.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 1500,
  },
  {
    code: 'NL-WASABI',
    name: 'Mù tạt Wasabi tươi nhuyễn',
    unit: 'g',
    costPrice: 300, // 300.000đ/kg
    initialStock: 8000, // 8kg
    minStock: 1000,
  },
  {
    code: 'NL-GUNG-HONG',
    name: 'Gừng hồng ngâm Gari chua ngọt',
    unit: 'g',
    costPrice: 80, // 80.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 2000,
  },
  {
    code: 'NL-ME-RANG',
    name: 'Mè trắng rang thơm',
    unit: 'g',
    costPrice: 120, // 120.000đ/kg
    initialStock: 10000, // 10kg
    minStock: 1000,
  },

  // --- Rong biển, Đậu hũ & Rau củ quả ---
  {
    code: 'NL-RONG-BIEN-LA',
    name: 'Lá rong biển Nori nướng Yaki Nori',
    unit: 'lá',
    costPrice: 1500, // 1.500đ/lá
    initialStock: 2000, // 2000 lá
    minStock: 200,
  },
  {
    code: 'NL-RONG-BIEN-WAKAME',
    name: 'Rong biển sấy khô Wakame',
    unit: 'g',
    costPrice: 350, // 350.000đ/kg
    initialStock: 5000, // 5kg khô
    minStock: 500,
  },
  {
    code: 'NL-RONG-BIEN-TRON-ME',
    name: 'Rong biển tươi trộn mè Chuka Wakame',
    unit: 'g',
    costPrice: 160, // 160.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 2000,
  },
  {
    code: 'NL-DAU-HU-NON',
    name: 'Đậu hũ non lụa Nhật Bản',
    unit: 'g',
    costPrice: 40, // 40.000đ/kg
    initialStock: 20000, // 20kg
    minStock: 2000,
  },
  {
    code: 'NL-CU-CAI',
    name: 'Củ cải trắng bào sợi Daikon',
    unit: 'g',
    costPrice: 20, // 20.000đ/kg
    initialStock: 25000, // 25kg
    minStock: 3000,
  },
  {
    code: 'NL-TIA-TO',
    name: 'Lá tía tô xanh Nhật Bản (Shiso)',
    unit: 'lá',
    costPrice: 1000, // 1.000đ/lá
    initialStock: 1200,
    minStock: 100,
  },
  {
    code: 'NL-BO-SAP',
    name: 'Quả bơ sáp cắt lát',
    unit: 'g',
    costPrice: 70, // 70.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 2000,
  },
  {
    code: 'NL-DUA-LEO',
    name: 'Dưa leo Nhật Kyuri thái sợi',
    unit: 'g',
    costPrice: 30, // 30.000đ/kg
    initialStock: 20000, // 20kg
    minStock: 2000,
  },
  {
    code: 'NL-HANH-LA',
    name: 'Hành lá Negi Nhật thái nhỏ',
    unit: 'g',
    costPrice: 30, // 30.000đ/kg
    initialStock: 10000, // 10kg
    minStock: 1000,
  },
  {
    code: 'NL-MANG-MENMA',
    name: 'Măng khô ngâm Menma Ramen',
    unit: 'g',
    costPrice: 150, // 150.000đ/kg
    initialStock: 10000, // 10kg
    minStock: 1000,
  },
  {
    code: 'NL-BAP-NGOT',
    name: 'Bắp ngọt hạt tươi hấp',
    unit: 'g',
    costPrice: 40, // 40.000đ/kg
    initialStock: 15000, // 15kg
    minStock: 1500,
  },
  {
    code: 'NL-CHA-CA-NARUTO',
    name: 'Chả cá Nhật Narutomaki thái lát',
    unit: 'g',
    costPrice: 300, // 300.000đ/kg
    initialStock: 8000, // 8kg
    minStock: 800,
  },

  // --- Trà & Tráng miệng ---
  {
    code: 'NL-TRA-GENMAICHA',
    name: 'Trà xanh gạo rang Genmaicha',
    unit: 'g',
    costPrice: 400, // 400.000đ/kg
    initialStock: 10000, // 10kg
    minStock: 1000,
  },
  {
    code: 'NL-MOCHI-MATCHA',
    name: 'Bánh Mochi Matcha nhân đậu đỏ',
    unit: 'viên',
    costPrice: 8000, // 8.000đ/viên
    initialStock: 500,
    minStock: 50,
  },
];

// 2. Định nghĩa công thức (BOM) cho tất cả món SINGLE
const RECIPES_CONFIG = {
  // 1. Sashimi Cá Hồi Na Uy (6 miếng)
  'SAS-SALMON-6PC': {
    notes: 'Tiêu chuẩn 6 lát cá hồi Na Uy tươi dày 8mm (~120g) kèm củ cải, tía tô, mù tạt wasabi, gừng hồng',
    items: [
      { ingredientCode: 'NL-CA-HOI', quantity: 120 },
      { ingredientCode: 'NL-CU-CAI', quantity: 30 },
      { ingredientCode: 'NL-TIA-TO', quantity: 1 },
      { ingredientCode: 'NL-WASABI', quantity: 5 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 10 },
    ],
  },

  // 2. Sashimi Bạch Tuộc Nhật Bản (4 miếng)
  'SAS-TAKO-4PC': {
    notes: 'Tiêu chuẩn 4 lát bạch tuộc Tako sashimi (~80g), decor củ cải bào, tía tô, wasabi, gừng hồng',
    items: [
      { ingredientCode: 'NL-BACH-TUOC', quantity: 80 },
      { ingredientCode: 'NL-CU-CAI', quantity: 30 },
      { ingredientCode: 'NL-TIA-TO', quantity: 1 },
      { ingredientCode: 'NL-WASABI', quantity: 5 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 10 },
    ],
  },

  // 3. Sashimi Sò Đỏ Tươi Sống (4 miếng)
  'SAS-HOKKIGAI-4PC': {
    notes: 'Tiêu chuẩn 4 miếng sò đỏ Hokkigai xẻ bướm (~80g), củ cải, tía tô, wasabi, gừng hồng',
    items: [
      { ingredientCode: 'NL-SO-DO', quantity: 80 },
      { ingredientCode: 'NL-CU-CAI', quantity: 30 },
      { ingredientCode: 'NL-TIA-TO', quantity: 1 },
      { ingredientCode: 'NL-WASABI', quantity: 5 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 10 },
    ],
  },

  // 4. Sushi Nigiri Cá Hồi Tươi (2 viên)
  'NIG-SALMON': {
    notes: 'Tiêu chuẩn 2 viên Nigiri cá hồi: 40g cơm giấm Shari (20g/viên), 30g cá hồi tươi, wasabi quết',
    items: [
      { ingredientCode: 'NL-COM-SUSHI', quantity: 40 },
      { ingredientCode: 'NL-CA-HOI', quantity: 30 },
      { ingredientCode: 'NL-WASABI', quantity: 3 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 5 },
    ],
  },

  // 5. Sushi Nigiri Tôm Luộc Ebi (2 viên)
  'NIG-EBI': {
    notes: 'Tiêu chuẩn 2 viên Nigiri tôm: 40g cơm giấm Shari, 2 con tôm Ebi sushi bướm, wasabi, gừng hồng',
    items: [
      { ingredientCode: 'NL-COM-SUSHI', quantity: 40 },
      { ingredientCode: 'NL-TOM-EBI', quantity: 2 },
      { ingredientCode: 'NL-WASABI', quantity: 3 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 5 },
    ],
  },

  // 6. Sushi Nigiri Lươn Nhật Nướng (2 viên)
  'NIG-UNAGI': {
    notes: 'Tiêu chuẩn 2 viên Nigiri lươn: 40g cơm giấm, 30g lươn nướng, 0.1 lá rong biển nẹp, 5ml sốt unagi, mè rang',
    items: [
      { ingredientCode: 'NL-COM-SUSHI', quantity: 40 },
      { ingredientCode: 'NL-LUON-NHAT', quantity: 30 },
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.1 },
      { ingredientCode: 'NL-SOT-UNAGI', quantity: 5 },
      { ingredientCode: 'NL-ME-RANG', quantity: 1 },
    ],
  },

  // 7. Gunkan Trứng Cua Cam Giòn (2 viên)
  'GUK-TOBIKO': {
    notes: 'Tiêu chuẩn 2 viên Gunkan: 40g cơm giấm, 0.2 lá rong biển Nori viền quanh, 25g trứng cua Tobiko tràn viền',
    items: [
      { ingredientCode: 'NL-COM-SUSHI', quantity: 40 },
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.2 },
      { ingredientCode: 'NL-TRUNG-CUA', quantity: 25 },
    ],
  },

  // 8. Cơm Cuộn Cá Hồi Quả Bơ (Salmon Avocado Roll - 8 khoanh)
  'ROL-SALMON-AVO': {
    notes: '1 cuộn Uramaki 8 miếng: 0.5 lá nori, 110g cơm giấm, 50g cá hồi tươi, 30g bơ sáp, 3g mè rang áo ngoài',
    items: [
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.5 },
      { ingredientCode: 'NL-COM-SUSHI', quantity: 110 },
      { ingredientCode: 'NL-CA-HOI', quantity: 50 },
      { ingredientCode: 'NL-BO-SAP', quantity: 30 },
      { ingredientCode: 'NL-ME-RANG', quantity: 3 },
    ],
  },

  // 9. Cơm Cuộn Tôm Chiên Giòn Tempura Roll (8 khoanh)
  'ROL-EBI-TEMPURA': {
    notes: '1 cuộn 8 miếng: 0.5 lá nori, 110g cơm giấm, 2 con tôm chiên tempura, 20g dưa leo, 10g xốt mayo, 5g trứng cua',
    items: [
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.5 },
      { ingredientCode: 'NL-COM-SUSHI', quantity: 110 },
      { ingredientCode: 'NL-TOM-TEMPURA', quantity: 2 },
      { ingredientCode: 'NL-DUA-LEO', quantity: 20 },
      { ingredientCode: 'NL-SOT-MAYO', quantity: 10 },
      { ingredientCode: 'NL-TRUNG-CUA', quantity: 5 },
    ],
  },

  // 10. Cơm Cuộn Rồng Lươn Nhật Đặc Biệt (Dragon Roll 8 khoanh)
  'ROL-DRAGON-UNAGI': {
    notes: '1 cuộn cao cấp 8 miếng: 0.5 lá nori, 110g cơm giấm, nhân tôm tempura (2 con) & dưa leo, phủ 60g lươn nướng & 30g bơ, sốt unagi & trứng cua',
    items: [
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.5 },
      { ingredientCode: 'NL-COM-SUSHI', quantity: 110 },
      { ingredientCode: 'NL-TOM-TEMPURA', quantity: 2 },
      { ingredientCode: 'NL-DUA-LEO', quantity: 20 },
      { ingredientCode: 'NL-LUON-NHAT', quantity: 60 },
      { ingredientCode: 'NL-BO-SAP', quantity: 30 },
      { ingredientCode: 'NL-SOT-UNAGI', quantity: 10 },
      { ingredientCode: 'NL-TRUNG-CUA', quantity: 5 },
      { ingredientCode: 'NL-ME-RANG', quantity: 2 },
    ],
  },

  // 11. Lươn Nhật Nướng Sốt Teriyaki Truyền Thống (1 đĩa)
  'ENT-UNAGI-TERI': {
    notes: '1 đĩa lươn nướng nóng: 150g lươn nướng Kabayaki, 25ml sốt Teriyaki đậm đà, 15g gừng hồng gari, 3g mè rang',
    items: [
      { ingredientCode: 'NL-LUON-NHAT', quantity: 150 },
      { ingredientCode: 'NL-SOT-TERIYAKI', quantity: 25 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 15 },
      { ingredientCode: 'NL-ME-RANG', quantity: 3 },
    ],
  },

  // 12. Súp Miso Rong Biển Đậu Hũ Thanh Nhẹ (1 bát)
  'ENT-MISO-SOUP': {
    notes: '1 bát súp Miso truyền thống: 250ml nước dashi, 20g tương miso, 40g đậu hũ non, 2g rong biển wakame, 5g hành lá negi',
    items: [
      { ingredientCode: 'NL-NUOC-DASHI', quantity: 250 },
      { ingredientCode: 'NL-TUONG-MISO', quantity: 20 },
      { ingredientCode: 'NL-DAU-HU-NON', quantity: 40 },
      { ingredientCode: 'NL-RONG-BIEN-WAKAME', quantity: 2 },
      { ingredientCode: 'NL-HANH-LA', quantity: 5 },
    ],
  },

  // 13. Mì Udon Nóng Bò Mỹ Thượng Hạng (1 tô)
  'NOO-BEEF-UDON': {
    notes: '1 tô mì Udon nóng: 200g mì udon Sanuki, 80g thịt ba chỉ bò Mỹ bào mỏng, 350ml nước dashi nóng, 10g chả cá naruto, 10g hành lá',
    items: [
      { ingredientCode: 'NL-MI-UDON', quantity: 200 },
      { ingredientCode: 'NL-BO-MY', quantity: 80 },
      { ingredientCode: 'NL-NUOC-DASHI', quantity: 350 },
      { ingredientCode: 'NL-CHA-CA-NARUTO', quantity: 10 },
      { ingredientCode: 'NL-HANH-LA', quantity: 10 },
    ],
  },

  // 14. Mì Ramen Thịt Chashu Nước Dùng Miso Đậm Đà (1 tô)
  'NOO-MISO-RAMEN': {
    notes: '1 tô mì Ramen Miso: 150g mì ramen, 2 lát thịt chashu 60g, 0.5 quả trứng ngâm tương tamago, 400ml nước dùng miso, 0.25 lá nori, măng menma 15g, bắp 20g, hành lá 10g',
    items: [
      { ingredientCode: 'NL-MI-RAMEN', quantity: 150 },
      { ingredientCode: 'NL-THIT-CHASHU', quantity: 60 },
      { ingredientCode: 'NL-TRUNG-TAMAGO', quantity: 0.5 },
      { ingredientCode: 'NL-NUOC-RAMEN-MISO', quantity: 400 },
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.25 },
      { ingredientCode: 'NL-MANG-MENMA', quantity: 15 },
      { ingredientCode: 'NL-BAP-NGOT', quantity: 20 },
      { ingredientCode: 'NL-HANH-LA', quantity: 10 },
    ],
  },

  // 15. Trà Xanh Gạo Rang Genmaicha Nhật Bản (Ấm)
  'DRK-GENMAICHA': {
    notes: '1 ấm trà phục vụ nóng: 8g trà gạo rang Genmaicha cao cấp hãm với 450ml nước sôi tinh khiết',
    items: [{ ingredientCode: 'NL-TRA-GENMAICHA', quantity: 8 }],
  },

  // 16. Bánh Mochi Matcha Đậu Đỏ Dẻo Thơm (2 viên)
  'DES-MATCHA-MOCHI': {
    notes: '1 đĩa tráng miệng 2 viên bánh Mochi dẻo vị trà xanh matcha bọc nhân đậu đỏ Azuki thơm bùi',
    items: [{ ingredientCode: 'NL-MOCHI-MATCHA', quantity: 2 }],
  },

  // 17. Seaweed salad (Salad rong biển mè Nhật)
  'NIG-SEAWEED-SALAD': {
    notes: '1 phần salad rong biển tươi mè Chuka Wakame 100g rắc 2g mè trắng rang thơm',
    items: [
      { ingredientCode: 'NL-RONG-BIEN-TRON-ME', quantity: 100 },
      { ingredientCode: 'NL-ME-RANG', quantity: 2 },
    ],
  },

  // 18. sushi (Sushi Nigiri Thập Cẩm Tiêu Chuẩn 3 viên)
  'NIG-SUSHI': {
    notes: 'Set 3 viên sushi tuyển chọn: 1 viên cá hồi tươi, 1 viên tôm ebi, 1 viên gunkan trứng cua tobiko kèm gừng hồng & wasabi',
    items: [
      { ingredientCode: 'NL-COM-SUSHI', quantity: 60 },
      { ingredientCode: 'NL-CA-HOI', quantity: 15 },
      { ingredientCode: 'NL-TOM-EBI', quantity: 1 },
      { ingredientCode: 'NL-TRUNG-CUA', quantity: 12 },
      { ingredientCode: 'NL-RONG-BIEN-LA', quantity: 0.1 },
      { ingredientCode: 'NL-WASABI', quantity: 5 },
      { ingredientCode: 'NL-GUNG-HONG', quantity: 10 },
    ],
  },
};

// 3. Cấu hình phân rã ComboItem cho các món COMBO
const COMBOS_CONFIG = {
  // Set Sushi & Sashimi Cá Hồi Toàn Diện (10 món)
  'SET-SALMON-10PC': [
    { childSku: 'SAS-SALMON-6PC', quantity: 1 }, // 6 miếng sashimi cá hồi
    { childSku: 'NIG-SALMON', quantity: 2 }, // 2 phần nigiri cá hồi (tổng 4 viên) => 10 món cá hồi
  ],

  // Set Sushi Gia Đình Thượng Hạng (Family Platter 16 viên)
  'SET-FAMILY-16PC': [
    { childSku: 'NIG-SALMON', quantity: 2 }, // 4 viên cá hồi
    { childSku: 'NIG-EBI', quantity: 2 }, // 4 viên tôm ebi
    { childSku: 'NIG-UNAGI', quantity: 2 }, // 4 viên lươn nướng
    { childSku: 'GUK-TOBIKO', quantity: 2 }, // 4 viên gunkan trứng cua => Tổng 16 viên
  ],

  // Salmon salad (Combo)
  'NIG-SALMON-SALAD': [
    { childSku: 'NIG-SEAWEED-SALAD', quantity: 1 }, // 1 phần salad rong biển
    { childSku: 'NIG-SALMON', quantity: 2 }, // 4 viên nigiri cá hồi tươi
  ],
};

async function main() {
  console.log('🚀 Bắt đầu khởi tạo dữ liệu Nguyên Liệu, Tồn Kho & Công Thức Món (BOM)...');

  // 1. Kiểm tra kho tổng mặc định
  let warehouse = await prisma.warehouse.findUnique({
    where: { id: DEFAULT_WAREHOUSE_ID },
  });
  if (!warehouse) {
    warehouse = await prisma.warehouse.upsert({
      where: { code: 'KHO-TONG-HCM' },
      update: {},
      create: {
        id: DEFAULT_WAREHOUSE_ID,
        code: 'KHO-TONG-HCM',
        name: 'Kho Tổng Bếp Trung Tâm TP.HCM',
        address: 'Số 10 Mai Chí Thọ, An Phú, TP. Thủ Đức, TP.HCM',
        isActive: true,
      },
    });
  }
  console.log(`✅ Kho đích: [${warehouse.code}] ${warehouse.name}`);

  // 2. Upsert tất cả nguyên liệu và khởi tạo tồn kho
  console.log(`\n📦 Đang tạo/cập nhật ${INGREDIENTS.length} nguyên liệu...`);
  const ingredientMap = new Map();

  for (const item of INGREDIENTS) {
    const ing = await prisma.ingredient.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        unit: item.unit,
        costPrice: item.costPrice,
        minStock: item.minStock,
        isActive: true,
      },
      create: {
        code: item.code,
        name: item.name,
        unit: item.unit,
        costPrice: item.costPrice,
        minStock: item.minStock,
        currentStock: item.initialStock,
        isActive: true,
      },
    });
    ingredientMap.set(item.code, ing);

    // Khởi tạo/cập nhật tồn kho ở Kho Tổng
    await prisma.warehouseStock.upsert({
      where: {
        warehouseId_ingredientId: {
          warehouseId: warehouse.id,
          ingredientId: ing.id,
        },
      },
      update: {
        minStock: item.minStock,
      },
      create: {
        warehouseId: warehouse.id,
        ingredientId: ing.id,
        currentStock: item.initialStock,
        minStock: item.minStock,
      },
    });

    console.log(`  ✔ [${ing.code}] ${ing.name} (${ing.unit}) -> Tồn kho: ${item.initialStock} ${ing.unit}`);
  }

  // 3. Upsert công thức (BOM) cho tất cả món SINGLE
  console.log(`\n🍲 Đang thiết lập công thức (BOM) cho các món SINGLE...`);
  const products = await prisma.product.findMany();
  const productMap = new Map(products.map((p) => [p.sku, p]));

  let recipeSuccessCount = 0;
  for (const [sku, cfg] of Object.entries(RECIPES_CONFIG)) {
    const product = productMap.get(sku);
    if (!product) {
      console.warn(`  ⚠️ Không tìm thấy món có SKU "${sku}" trong cơ sở dữ liệu!`);
      continue;
    }

    // Upsert Recipe
    const recipe = await prisma.recipe.upsert({
      where: { productId: product.id },
      update: {
        notes: cfg.notes,
        isActive: true,
      },
      create: {
        productId: product.id,
        notes: cfg.notes,
        isActive: true,
      },
    });

    // Xóa các items cũ nếu có để đồng bộ lại
    await prisma.recipeItem.deleteMany({
      where: { recipeId: recipe.id },
    });

    // Thêm các recipe items mới
    for (const item of cfg.items) {
      const ing = ingredientMap.get(item.ingredientCode);
      if (!ing) {
        console.error(`  ❌ Lỗi: Nguyên liệu mã "${item.ingredientCode}" không tồn tại!`);
        continue;
      }

      await prisma.recipeItem.create({
        data: {
          recipeId: recipe.id,
          ingredientId: ing.id,
          quantity: item.quantity,
        },
      });
    }

    console.log(`  ✔ [${product.sku}] ${product.name}: ${cfg.items.length} nguyên liệu cấu thành`);
    recipeSuccessCount++;
  }

  // 4. Upsert ComboItem cho các món COMBO
  console.log(`\n🍱 Đang thiết lập phân rã món thành phần cho các Combo...`);
  let comboSuccessCount = 0;

  for (const [comboSku, children] of Object.entries(COMBOS_CONFIG)) {
    const comboProduct = productMap.get(comboSku);
    if (!comboProduct) {
      console.warn(`  ⚠️ Không tìm thấy Combo SKU "${comboSku}" trong cơ sở dữ liệu!`);
      continue;
    }

    // Xóa liên kết combo cũ nếu có
    await prisma.comboItem.deleteMany({
      where: { comboId: comboProduct.id },
    });

    for (const child of children) {
      const childProduct = productMap.get(child.childSku);
      if (!childProduct) {
        console.warn(`    ⚠️ Không tìm thấy món thành phần SKU "${child.childSku}"!`);
        continue;
      }

      await prisma.comboItem.create({
        data: {
          comboId: comboProduct.id,
          childProductId: childProduct.id,
          quantity: child.quantity,
        },
      });
      console.log(`    ↳ Combo [${comboProduct.name}] gồm ${child.quantity}x [${childProduct.name}]`);
    }
    comboSuccessCount++;
  }

  console.log('\n======================================================');
  console.log(`🎉 HOÀN THÀNH TẠO DỮ LIỆU THÀNH CÔNG!`);
  console.log(`- Nguyên liệu đã cấu hình: ${INGREDIENTS.length}`);
  console.log(`- Công thức món SINGLE (BOM): ${recipeSuccessCount}`);
  console.log(`- Cấu hình Combo thành phần: ${comboSuccessCount}`);
  console.log('======================================================\n');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi khi thực hiện seed công thức & nguyên liệu:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
