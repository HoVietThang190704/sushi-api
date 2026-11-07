import { Injectable } from '@nestjs/common';

export interface HCMWardDefinition {
  code: string;
  name: string;
  type: 'phuong' | 'xa' | 'dac_khu';
  area: string; // Tên khu vực / quận huyện tham chiếu
}

/**
 * Danh mục chuẩn 168 đơn vị hành chính cấp xã của TP. Hồ Chí Minh
 * Căn cứ theo Nghị quyết số 1685/NQ-UBTVQH15 của Ủy ban Thường vụ Quốc hội
 * (Gồm 113 phường, 54 xã và 01 đặc khu)
 */
export const OFFICIAL_HCM_WARDS: HCMWardDefinition[] = [
  // --- Khu vực Quận 1 cũ ---
  { code: 'HCM-Q1-SG', name: 'Phường Sài Gòn', type: 'phuong', area: 'Khu vực 1 (Quận 1 cũ)' },
  { code: 'HCM-Q1-TD', name: 'Phường Tân Định', type: 'phuong', area: 'Khu vực 1 (Quận 1 cũ)' },
  { code: 'HCM-Q1-BT', name: 'Phường Bến Thành', type: 'phuong', area: 'Khu vực 1 (Quận 1 cũ)' },
  { code: 'HCM-Q1-COL', name: 'Phường Cầu Ông Lãnh', type: 'phuong', area: 'Khu vực 1 (Quận 1 cũ)' },

  // --- Khu vực Quận 3 cũ ---
  { code: 'HCM-Q3-BC', name: 'Phường Bàn Cờ', type: 'phuong', area: 'Khu vực 3 (Quận 3 cũ)' },
  { code: 'HCM-Q3-XH', name: 'Phường Xuân Hòa', type: 'phuong', area: 'Khu vực 3 (Quận 3 cũ)' },
  { code: 'HCM-Q3-NL', name: 'Phường Nhiêu Lộc', type: 'phuong', area: 'Khu vực 3 (Quận 3 cũ)' },

  // --- Khu vực Quận 4 cũ ---
  { code: 'HCM-Q4-XC', name: 'Phường Xóm Chiếu', type: 'phuong', area: 'Khu vực 4 (Quận 4 cũ)' },
  { code: 'HCM-Q4-KH', name: 'Phường Khánh Hội', type: 'phuong', area: 'Khu vực 4 (Quận 4 cũ)' },
  { code: 'HCM-Q4-VH', name: 'Phường Vĩnh Hội', type: 'phuong', area: 'Khu vực 4 (Quận 4 cũ)' },

  // --- Khu vực Quận 5 cũ ---
  { code: 'HCM-Q5-CQ', name: 'Phường Chợ Quán', type: 'phuong', area: 'Khu vực 5 (Quận 5 cũ)' },
  { code: 'HCM-Q5-AD', name: 'Phường An Đông', type: 'phuong', area: 'Khu vực 5 (Quận 5 cũ)' },
  { code: 'HCM-Q5-CL', name: 'Phường Chợ Lớn', type: 'phuong', area: 'Khu vực 5 (Quận 5 cũ)' },

  // --- Khu vực Quận 6 cũ ---
  { code: 'HCM-Q6-BT', name: 'Phường Bình Tây', type: 'phuong', area: 'Khu vực 6 (Quận 6 cũ)' },
  { code: 'HCM-Q6-BTI', name: 'Phường Bình Tiên', type: 'phuong', area: 'Khu vực 6 (Quận 6 cũ)' },
  { code: 'HCM-Q6-BP', name: 'Phường Bình Phú', type: 'phuong', area: 'Khu vực 6 (Quận 6 cũ)' },
  { code: 'HCM-Q6-PL', name: 'Phường Phú Lâm', type: 'phuong', area: 'Khu vực 6 (Quận 6 cũ)' },

  // --- Khu vực Quận 7 cũ ---
  { code: 'HCM-Q7-TT', name: 'Phường Tân Thuận', type: 'phuong', area: 'Khu vực 7 (Quận 7 cũ)' },
  { code: 'HCM-Q7-PT', name: 'Phường Phú Thuận', type: 'phuong', area: 'Khu vực 7 (Quận 7 cũ)' },
  { code: 'HCM-Q7-TM', name: 'Phường Tân Mỹ', type: 'phuong', area: 'Khu vực 7 (Quận 7 cũ)' },
  { code: 'HCM-Q7-TH', name: 'Phường Tân Hưng', type: 'phuong', area: 'Khu vực 7 (Quận 7 cũ)' },

  // --- Khu vực Quận 8 cũ ---
  { code: 'HCM-Q8-CH', name: 'Phường Chánh Hưng', type: 'phuong', area: 'Khu vực 8 (Quận 8 cũ)' },
  { code: 'HCM-Q8-PD', name: 'Phường Phú Định', type: 'phuong', area: 'Khu vực 8 (Quận 8 cũ)' },
  { code: 'HCM-Q8-BD', name: 'Phường Bình Đông', type: 'phuong', area: 'Khu vực 8 (Quận 8 cũ)' },

  // --- Khu vực Quận 10 cũ ---
  { code: 'HCM-Q10-DH', name: 'Phường Diên Hồng', type: 'phuong', area: 'Khu vực 10 (Quận 10 cũ)' },
  { code: 'HCM-Q10-VL', name: 'Phường Vườn Lài', type: 'phuong', area: 'Khu vực 10 (Quận 10 cũ)' },
  { code: 'HCM-Q10-HH', name: 'Phường Hòa Hưng', type: 'phuong', area: 'Khu vực 10 (Quận 10 cũ)' },

  // --- Khu vực Quận 11 cũ ---
  { code: 'HCM-Q11-MP', name: 'Phường Minh Phụng', type: 'phuong', area: 'Khu vực 11 (Quận 11 cũ)' },
  { code: 'HCM-Q11-BT', name: 'Phường Bình Thới', type: 'phuong', area: 'Khu vực 11 (Quận 11 cũ)' },
  { code: 'HCM-Q11-HB', name: 'Phường Hòa Bình', type: 'phuong', area: 'Khu vực 11 (Quận 11 cũ)' },
  { code: 'HCM-Q11-PT', name: 'Phường Phú Thọ', type: 'phuong', area: 'Khu vực 11 (Quận 11 cũ)' },

  // --- Khu vực Quận 12 cũ ---
  { code: 'HCM-Q12-DHT', name: 'Phường Đông Hưng Thuận', type: 'phuong', area: 'Khu vực 12 (Quận 12 cũ)' },
  { code: 'HCM-Q12-TMT', name: 'Phường Trung Mỹ Tây', type: 'phuong', area: 'Khu vực 12 (Quận 12 cũ)' },
  { code: 'HCM-Q12-TTH', name: 'Phường Tân Thới Hiệp', type: 'phuong', area: 'Khu vực 12 (Quận 12 cũ)' },
  { code: 'HCM-Q12-TA', name: 'Phường Thới An', type: 'phuong', area: 'Khu vực 12 (Quận 12 cũ)' },
  { code: 'HCM-Q12-APD', name: 'Phường An Phú Đông', type: 'phuong', area: 'Khu vực 12 (Quận 12 cũ)' },

  // --- Khu vực Quận Bình Tân cũ ---
  { code: 'HCM-BTAN-AL', name: 'Phường An Lạc', type: 'phuong', area: 'Khu vực Bình Tân (cũ)' },
  { code: 'HCM-BTAN-BT', name: 'Phường Bình Tân', type: 'phuong', area: 'Khu vực Bình Tân (cũ)' },
  { code: 'HCM-BTAN-TT', name: 'Phường Tân Tạo', type: 'phuong', area: 'Khu vực Bình Tân (cũ)' },
  { code: 'HCM-BTAN-BTD', name: 'Phường Bình Trị Đông', type: 'phuong', area: 'Khu vực Bình Tân (cũ)' },
  { code: 'HCM-BTAN-BHH', name: 'Phường Bình Hưng Hòa', type: 'phuong', area: 'Khu vực Bình Tân (cũ)' },

  // --- Khu vực Quận Bình Thạnh cũ ---
  { code: 'HCM-BTH-GD', name: 'Phường Gia Định', type: 'phuong', area: 'Khu vực Bình Thạnh (cũ)' },
  { code: 'HCM-BTH-BT', name: 'Phường Bình Thạnh', type: 'phuong', area: 'Khu vực Bình Thạnh (cũ)' },
  { code: 'HCM-BTH-BLT', name: 'Phường Bình Lợi Trung', type: 'phuong', area: 'Khu vực Bình Thạnh (cũ)' },
  { code: 'HCM-BTH-TMT', name: 'Phường Thạnh Mỹ Tây', type: 'phuong', area: 'Khu vực Bình Thạnh (cũ)' },
  { code: 'HCM-BTH-BQ', name: 'Phường Bình Quới', type: 'phuong', area: 'Khu vực Bình Thạnh (cũ)' },

  // --- Khu vực Quận Gò Vấp cũ ---
  { code: 'HCM-GV-HT', name: 'Phường Hạnh Thông', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },
  { code: 'HCM-GV-AN', name: 'Phường An Nhơn', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },
  { code: 'HCM-GV-GV', name: 'Phường Gò Vấp', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },
  { code: 'HCM-GV-AHD', name: 'Phường An Hội Đông', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },
  { code: 'HCM-GV-TTH', name: 'Phường Thông Tây Hội', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },
  { code: 'HCM-GV-AHT', name: 'Phường An Hội Tây', type: 'phuong', area: 'Khu vực Gò Vấp (cũ)' },

  // --- Khu vực Quận Phú Nhuận cũ ---
  { code: 'HCM-PN-DN', name: 'Phường Đức Nhuận', type: 'phuong', area: 'Khu vực Phú Nhuận (cũ)' },
  { code: 'HCM-PN-CK', name: 'Phường Cầu Kiệu', type: 'phuong', area: 'Khu vực Phú Nhuận (cũ)' },
  { code: 'HCM-PN-PN', name: 'Phường Phú Nhuận', type: 'phuong', area: 'Khu vực Phú Nhuận (cũ)' },

  // --- Khu vực Quận Tân Bình cũ ---
  { code: 'HCM-TB-TSH', name: 'Phường Tân Sơn Hòa', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },
  { code: 'HCM-TB-TSN', name: 'Phường Tân Sơn Nhất', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },
  { code: 'HCM-TB-TH', name: 'Phường Tân Hòa', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },
  { code: 'HCM-TB-BH', name: 'Phường Bảy Hiền', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },
  { code: 'HCM-TB-TB', name: 'Phường Tân Bình', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },
  { code: 'HCM-TB-TS', name: 'Phường Tân Sơn', type: 'phuong', area: 'Khu vực Tân Bình (cũ)' },

  // --- Khu vực Quận Tân Phú cũ ---
  { code: 'HCM-TP-TT', name: 'Phường Tây Thạnh', type: 'phuong', area: 'Khu vực Tân Phú (cũ)' },
  { code: 'HCM-TP-TSN', name: 'Phường Tân Sơn Nhì', type: 'phuong', area: 'Khu vực Tân Phú (cũ)' },
  { code: 'HCM-TP-PTH', name: 'Phường Phú Thọ Hòa', type: 'phuong', area: 'Khu vực Tân Phú (cũ)' },
  { code: 'HCM-TP-TP', name: 'Phường Tân Phú', type: 'phuong', area: 'Khu vực Tân Phú (cũ)' },
  { code: 'HCM-TP-PT', name: 'Phường Phú Thạnh', type: 'phuong', area: 'Khu vực Tân Phú (cũ)' },

  // --- Khu vực Thành phố Thủ Đức ---
  { code: 'HCM-TDU-HB', name: 'Phường Hiệp Bình', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-TD', name: 'Phường Thủ Đức', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-TB', name: 'Phường Tam Bình', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-LX', name: 'Phường Linh Xuân', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-TNP', name: 'Phường Tăng Nhơn Phú', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-LB', name: 'Phường Long Bình', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-LP', name: 'Phường Long Phước', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-LT', name: 'Phường Long Trường', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-CL', name: 'Phường Cát Lái', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-BT', name: 'Phường Bình Trưng', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-PL', name: 'Phường Phước Long', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },
  { code: 'HCM-TDU-AK', name: 'Phường An Khánh', type: 'phuong', area: 'Khu vực TP. Thủ Đức' },

  // --- Khu vực Dĩ An / Thuận An / Thủ Dầu Một / Bến Cát / Tân Uyên ---
  { code: 'HCM-BD-DH', name: 'Phường Đông Hòa', type: 'phuong', area: 'Khu vực Dĩ An' },
  { code: 'HCM-BD-DA', name: 'Phường Dĩ An', type: 'phuong', area: 'Khu vực Dĩ An' },
  { code: 'HCM-BD-TDH', name: 'Phường Tân Đông Hiệp', type: 'phuong', area: 'Khu vực Dĩ An' },
  { code: 'HCM-BD-AP', name: 'Phường An Phú', type: 'phuong', area: 'Khu vực Thuận An' },
  { code: 'HCM-BD-BH', name: 'Phường Bình Hòa', type: 'phuong', area: 'Khu vực Thuận An' },
  { code: 'HCM-BD-LT', name: 'Phường Lái Thiêu', type: 'phuong', area: 'Khu vực Thuận An' },
  { code: 'HCM-BD-TA', name: 'Phường Thuận An', type: 'phuong', area: 'Khu vực Thuận An' },
  { code: 'HCM-BD-TG', name: 'Phường Thuận Giao', type: 'phuong', area: 'Khu vực Thuận An' },
  { code: 'HCM-BD-TDM', name: 'Phường Thủ Dầu Một', type: 'phuong', area: 'Khu vực Thủ Dầu Một' },
  { code: 'HCM-BD-PL', name: 'Phường Phú Lợi', type: 'phuong', area: 'Khu vực Thủ Dầu Một' },
  { code: 'HCM-BD-CH', name: 'Phường Chánh Hiệp', type: 'phuong', area: 'Khu vực Thủ Dầu Một' },
  { code: 'HCM-BD-BDU', name: 'Phường Bình Dương', type: 'phuong', area: 'Khu vực Thủ Dầu Một' },
  { code: 'HCM-BD-HL', name: 'Phường Hòa Lợi', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-PA', name: 'Phường Phú An', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-TN', name: 'Phường Tây Nam', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-LN', name: 'Phường Long Nguyên', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-BC', name: 'Phường Bến Cát', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-CPH', name: 'Phường Chánh Phú Hòa', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-THO', name: 'Phường Thới Hòa', type: 'phuong', area: 'Khu vực Bến Cát' },
  { code: 'HCM-BD-VT', name: 'Phường Vĩnh Tân', type: 'phuong', area: 'Khu vực Tân Uyên' },
  { code: 'HCM-BD-BC2', name: 'Phường Bình Cơ', type: 'phuong', area: 'Khu vực Tân Uyên' },
  { code: 'HCM-BD-TU', name: 'Phường Tân Uyên', type: 'phuong', area: 'Khu vực Tân Uyên' },
  { code: 'HCM-BD-TH2', name: 'Phường Tân Hiệp', type: 'phuong', area: 'Khu vực Tân Uyên' },
  { code: 'HCM-BD-TK', name: 'Phường Tân Khánh', type: 'phuong', area: 'Khu vực Tân Uyên' },

  // --- Khu vực Vũng Tàu / Bà Rịa / Phú Mỹ ---
  { code: 'HCM-VT-VT', name: 'Phường Vũng Tàu', type: 'phuong', area: 'Khu vực Vũng Tàu' },
  { code: 'HCM-VT-TT', name: 'Phường Tam Thắng', type: 'phuong', area: 'Khu vực Vũng Tàu' },
  { code: 'HCM-VT-RD', name: 'Phường Rạch Dừa', type: 'phuong', area: 'Khu vực Vũng Tàu' },
  { code: 'HCM-VT-PT', name: 'Phường Phước Thắng', type: 'phuong', area: 'Khu vực Vũng Tàu' },
  { code: 'HCM-VT-LH', name: 'Phường Long Hương', type: 'phuong', area: 'Khu vực Bà Rịa' },
  { code: 'HCM-VT-BR', name: 'Phường Bà Rịa', type: 'phuong', area: 'Khu vực Bà Rịa' },
  { code: 'HCM-VT-TL', name: 'Phường Tam Long', type: 'phuong', area: 'Khu vực Bà Rịa' },
  { code: 'HCM-VT-THAI', name: 'Phường Tân Hải', type: 'phuong', area: 'Khu vực Phú Mỹ' },
  { code: 'HCM-VT-TPHU', name: 'Phường Tân Phước', type: 'phuong', area: 'Khu vực Phú Mỹ' },
  { code: 'HCM-VT-PM', name: 'Phường Phú Mỹ', type: 'phuong', area: 'Khu vực Phú Mỹ' },
  { code: 'HCM-VT-TTH', name: 'Phường Tân Thành', type: 'phuong', area: 'Khu vực Phú Mỹ' },

  // --- Khu vực Huyện Bình Chánh cũ ---
  { code: 'HCM-BC-VL', name: 'Xã Vĩnh Lộc', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-TVL', name: 'Xã Tân Vĩnh Lộc', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-BL', name: 'Xã Bình Lợi', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-TN', name: 'Xã Tân Nhựt', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-BC', name: 'Xã Bình Chánh', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-HL', name: 'Xã Hưng Long', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },
  { code: 'HCM-BC-BH', name: 'Xã Bình Hưng', type: 'xa', area: 'Khu vực Bình Chánh (cũ)' },

  // --- Khu vực Huyện Cần Giờ cũ ---
  { code: 'HCM-CG-BK', name: 'Xã Bình Khánh', type: 'xa', area: 'Khu vực Cần Giờ (cũ)' },
  { code: 'HCM-CG-ATD', name: 'Xã An Thới Đông', type: 'xa', area: 'Khu vực Cần Giờ (cũ)' },
  { code: 'HCM-CG-CG', name: 'Xã Cần Giờ', type: 'xa', area: 'Khu vực Cần Giờ (cũ)' },
  { code: 'HCM-CG-TA', name: 'Xã Thạnh An', type: 'xa', area: 'Khu vực Cần Giờ (cũ)' },

  // --- Khu vực Huyện Củ Chi cũ ---
  { code: 'HCM-CC-CC', name: 'Xã Củ Chi', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-TAH', name: 'Xã Tân An Hội', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-TM', name: 'Xã Thái Mỹ', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-ANT', name: 'Xã An Nhơn Tây', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-ND', name: 'Xã Nhuận Đức', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-PHD', name: 'Xã Phú Hòa Đông', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },
  { code: 'HCM-CC-BM', name: 'Xã Bình Mỹ', type: 'xa', area: 'Khu vực Củ Chi (cũ)' },

  // --- Khu vực Huyện Hóc Môn cũ ---
  { code: 'HCM-HM-DT', name: 'Xã Đông Thạnh', type: 'xa', area: 'Khu vực Hóc Môn (cũ)' },
  { code: 'HCM-HM-HM', name: 'Xã Hóc Môn', type: 'xa', area: 'Khu vực Hóc Môn (cũ)' },
  { code: 'HCM-HM-XTS', name: 'Xã Xuân Thới Sơn', type: 'xa', area: 'Khu vực Hóc Môn (cũ)' },
  { code: 'HCM-HM-BD', name: 'Xã Bà Điểm', type: 'xa', area: 'Khu vực Hóc Môn (cũ)' },

  // --- Khu vực Huyện Nhà Bè cũ ---
  { code: 'HCM-NB-NB', name: 'Xã Nhà Bè', type: 'xa', area: 'Khu vực Nhà Bè (cũ)' },
  { code: 'HCM-NB-HP', name: 'Xã Hiệp Phước', type: 'xa', area: 'Khu vực Nhà Bè (cũ)' },

  // --- Khu vực các xã thuộc Bắc Tân Uyên, Phú Giáo, Bàu Bàng, Dầu Tiếng ---
  { code: 'HCM-BD-TTAN', name: 'Xã Thường Tân', type: 'xa', area: 'Khu vực Bắc Tân Uyên' },
  { code: 'HCM-BD-BTU', name: 'Xã Bắc Tân Uyên', type: 'xa', area: 'Khu vực Bắc Tân Uyên' },
  { code: 'HCM-BD-PG', name: 'Xã Phú Giáo', type: 'xa', area: 'Khu vực Phú Giáo' },
  { code: 'HCM-BD-PH', name: 'Xã Phước Hòa', type: 'xa', area: 'Khu vực Phú Giáo' },
  { code: 'HCM-BD-PT', name: 'Xã Phước Thành', type: 'xa', area: 'Khu vực Phú Giáo' },
  { code: 'HCM-BD-AL', name: 'Xã An Long', type: 'xa', area: 'Khu vực Phú Giáo' },
  { code: 'HCM-BD-TVT', name: 'Xã Trừ Văn Thố', type: 'xa', area: 'Khu vực Bàu Bàng' },
  { code: 'HCM-BD-BB', name: 'Xã Bàu Bàng', type: 'xa', area: 'Khu vực Bàu Bàng' },
  { code: 'HCM-BD-LH', name: 'Xã Long Hòa', type: 'xa', area: 'Khu vực Dầu Tiếng' },
  { code: 'HCM-BD-TA2', name: 'Xã Thanh An', type: 'xa', area: 'Khu vực Dầu Tiếng' },
  { code: 'HCM-BD-DT', name: 'Xã Dầu Tiếng', type: 'xa', area: 'Khu vực Dầu Tiếng' },
  { code: 'HCM-BD-MT', name: 'Xã Minh Thạnh', type: 'xa', area: 'Khu vực Dầu Tiếng' },

  // --- Khu vực các xã thuộc Châu Đức, Long Đất, Xuyên Mộc ---
  { code: 'HCM-VT-LS', name: 'Xã Long Sơn', type: 'xa', area: 'Khu vực Vũng Tàu' },
  { code: 'HCM-VT-CP', name: 'Xã Châu Pha', type: 'xa', area: 'Khu vực Phú Mỹ' },
  { code: 'HCM-VT-LHD', name: 'Xã Long Hải', type: 'xa', area: 'Khu vực Long Đất' },
  { code: 'HCM-VT-LD', name: 'Xã Long Điền', type: 'xa', area: 'Khu vực Long Đất' },
  { code: 'HCM-VT-PH', name: 'Xã Phước Hải', type: 'xa', area: 'Khu vực Long Đất' },
  { code: 'HCM-VT-DD', name: 'Xã Đất Đỏ', type: 'xa', area: 'Khu vực Long Đất' },
  { code: 'HCM-VT-NT', name: 'Xã Nghĩa Thành', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-NG', name: 'Xã Ngãi Giao', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-KL', name: 'Xã Kim Long', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-CD', name: 'Xã Châu Đức', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-BG', name: 'Xã Bình Giã', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-XS', name: 'Xã Xuân Sơn', type: 'xa', area: 'Khu vực Châu Đức' },
  { code: 'HCM-VT-HT', name: 'Xã Hồ Tràm', type: 'xa', area: 'Khu vực Xuyên Mộc' },
  { code: 'HCM-VT-XM', name: 'Xã Xuyên Mộc', type: 'xa', area: 'Khu vực Xuyên Mộc' },
  { code: 'HCM-VT-HH', name: 'Xã Hòa Hội', type: 'xa', area: 'Khu vực Xuyên Mộc' },
  { code: 'HCM-VT-BL', name: 'Xã Bàu Lâm', type: 'xa', area: 'Khu vực Xuyên Mộc' },
  { code: 'HCM-VT-HHI', name: 'Xã Hòa Hiệp', type: 'xa', area: 'Khu vực Xuyên Mộc' },
  { code: 'HCM-VT-BC', name: 'Xã Bình Châu', type: 'xa', area: 'Khu vực Xuyên Mộc' },

  // --- Đặc khu ---
  { code: 'HCM-DK-CD', name: 'Đặc khu Côn Đảo', type: 'dac_khu', area: 'Đặc khu Côn Đảo' },
];

@Injectable()
export class VietnamAddressService {
  getAllWards(): HCMWardDefinition[] {
    return OFFICIAL_HCM_WARDS;
  }

  findWardByName(name: string): HCMWardDefinition | undefined {
    const clean = name.trim().toLowerCase();
    return OFFICIAL_HCM_WARDS.find(
      (w) =>
        w.name.toLowerCase() === clean ||
        w.name.toLowerCase().replace(/^(phường|xã|đặc khu)\s+/i, '') ===
          clean.replace(/^(phường|xã|đặc khu)\s+/i, ''),
    );
  }

  getAreas(): string[] {
    const set = new Set<string>();
    OFFICIAL_HCM_WARDS.forEach((w) => set.add(w.area));
    return Array.from(set);
  }
}
