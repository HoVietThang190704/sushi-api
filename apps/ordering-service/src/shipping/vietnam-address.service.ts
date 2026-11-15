import { Injectable } from '@nestjs/common';

export interface HCMWardDefinition {
  code: string;
  name: string;
  type: 'phuong' | 'xa' | 'dac_khu';
  area: string; // Tên khu vực / quận huyện tham chiếu
  formerWards?: string; // Tên các phường/xã cũ trước sáp nhập
}

/**
 * Danh mục chuẩn 168 đơn vị hành chính cấp xã của TP. Hồ Chí Minh
 * Căn cứ theo Nghị quyết số 1685/NQ-UBTVQH15 của Ủy ban Thường vụ Quốc hội
 * (Gồm 113 phường, 54 xã và 01 đặc khu)
 */
export const OFFICIAL_HCM_WARDS: HCMWardDefinition[] = [
  // --- Khu vực Quận 1 cũ ---
  {
    code: 'HCM-Q1-SG',
    name: 'Phường Sài Gòn',
    type: 'phuong',
    area: 'Khu vực 1 (Quận 1 cũ)',
    formerWards: 'Phường Bến Nghé, Nguyễn Thái Bình',
  },
  {
    code: 'HCM-Q1-TD',
    name: 'Phường Tân Định',
    type: 'phuong',
    area: 'Khu vực 1 (Quận 1 cũ)',
    formerWards: 'Phường Tân Định, Đa Kao',
  },
  {
    code: 'HCM-Q1-BT',
    name: 'Phường Bến Thành',
    type: 'phuong',
    area: 'Khu vực 1 (Quận 1 cũ)',
    formerWards: 'Phường Bến Thành, Phạm Ngũ Lão',
  },
  {
    code: 'HCM-Q1-COL',
    name: 'Phường Cầu Ông Lãnh',
    type: 'phuong',
    area: 'Khu vực 1 (Quận 1 cũ)',
    formerWards: 'Phường Cầu Ông Lãnh, Cô Giang, Cầu Kho',
  },

  // --- Khu vực Quận 3 cũ ---
  {
    code: 'HCM-Q3-BC',
    name: 'Phường Bàn Cờ',
    type: 'phuong',
    area: 'Khu vực 3 (Quận 3 cũ)',
    formerWards: 'Phường 1, 2, 3, 5 (Quận 3)',
  },
  {
    code: 'HCM-Q3-XH',
    name: 'Phường Xuân Hòa',
    type: 'phuong',
    area: 'Khu vực 3 (Quận 3 cũ)',
    formerWards: 'Phường Võ Thị Sáu, Phường 4 (Quận 3)',
  },
  {
    code: 'HCM-Q3-NL',
    name: 'Phường Nhiêu Lộc',
    type: 'phuong',
    area: 'Khu vực 3 (Quận 3 cũ)',
    formerWards: 'Phường 9, 10, 11, 12, 14 (Quận 3)',
  },

  // --- Khu vực Quận 4 cũ ---
  {
    code: 'HCM-Q4-XC',
    name: 'Phường Xóm Chiếu',
    type: 'phuong',
    area: 'Khu vực 4 (Quận 4 cũ)',
    formerWards: 'Phường 1, 2, 3, 4 (Quận 4)',
  },
  {
    code: 'HCM-Q4-KH',
    name: 'Phường Khánh Hội',
    type: 'phuong',
    area: 'Khu vực 4 (Quận 4 cũ)',
    formerWards: 'Phường 6, 8, 9 (Quận 4)',
  },
  {
    code: 'HCM-Q4-VH',
    name: 'Phường Vĩnh Hội',
    type: 'phuong',
    area: 'Khu vực 4 (Quận 4 cũ)',
    formerWards: 'Phường 13, 14, 15, 16, 18 (Quận 4)',
  },

  // --- Khu vực Quận 5 cũ ---
  {
    code: 'HCM-Q5-CQ',
    name: 'Phường Chợ Quán',
    type: 'phuong',
    area: 'Khu vực 5 (Quận 5 cũ)',
    formerWards: 'Phường 1, 2, 3, 4 (Quận 5)',
  },
  {
    code: 'HCM-Q5-AD',
    name: 'Phường An Đông',
    type: 'phuong',
    area: 'Khu vực 5 (Quận 5 cũ)',
    formerWards: 'Phường 5, 7, 8, 9 (Quận 5)',
  },
  {
    code: 'HCM-Q5-CL',
    name: 'Phường Chợ Lớn',
    type: 'phuong',
    area: 'Khu vực 5 (Quận 5 cũ)',
    formerWards: 'Phường 11, 12, 13, 14 (Quận 5)',
  },

  // --- Khu vực Quận 6 cũ ---
  {
    code: 'HCM-Q6-BT',
    name: 'Phường Bình Tây',
    type: 'phuong',
    area: 'Khu vực 6 (Quận 6 cũ)',
    formerWards: 'Phường 1, 3, 4, 7, 8 (Quận 6)',
  },
  {
    code: 'HCM-Q6-BTI',
    name: 'Phường Bình Tiên',
    type: 'phuong',
    area: 'Khu vực 6 (Quận 6 cũ)',
    formerWards: 'Phường 2, 5, 6, 9 (Quận 6)',
  },
  {
    code: 'HCM-Q6-BP',
    name: 'Phường Bình Phú',
    type: 'phuong',
    area: 'Khu vực 6 (Quận 6 cũ)',
    formerWards: 'Phường 10, 11 (Quận 6)',
  },
  {
    code: 'HCM-Q6-PL',
    name: 'Phường Phú Lâm',
    type: 'phuong',
    area: 'Khu vực 6 (Quận 6 cũ)',
    formerWards: 'Phường 12, 13, 14 (Quận 6)',
  },

  // --- Khu vực Quận 7 cũ ---
  {
    code: 'HCM-Q7-TT',
    name: 'Phường Tân Thuận',
    type: 'phuong',
    area: 'Khu vực 7 (Quận 7 cũ)',
    formerWards: 'Phường Tân Thuận Đông, Tân Thuận Tây',
  },
  {
    code: 'HCM-Q7-PT',
    name: 'Phường Phú Thuận',
    type: 'phuong',
    area: 'Khu vực 7 (Quận 7 cũ)',
    formerWards: 'Phường Phú Thuận, Phú Mỹ',
  },
  {
    code: 'HCM-Q7-TM',
    name: 'Phường Tân Mỹ',
    type: 'phuong',
    area: 'Khu vực 7 (Quận 7 cũ)',
    formerWards: 'Phường Tân Phú, Tân Quy, Tân Kiểng',
  },
  {
    code: 'HCM-Q7-TH',
    name: 'Phường Tân Hưng',
    type: 'phuong',
    area: 'Khu vực 7 (Quận 7 cũ)',
    formerWards: 'Phường Tân Hưng, Tân Phong',
  },

  // --- Khu vực Quận 8 cũ ---
  {
    code: 'HCM-Q8-CH',
    name: 'Phường Chánh Hưng',
    type: 'phuong',
    area: 'Khu vực 8 (Quận 8 cũ)',
    formerWards: 'Phường 1, 2, 3, 4, 5 (Quận 8)',
  },
  {
    code: 'HCM-Q8-PD',
    name: 'Phường Phú Định',
    type: 'phuong',
    area: 'Khu vực 8 (Quận 8 cũ)',
    formerWards: 'Phường 6, 7, 10, 14 (Quận 8)',
  },
  {
    code: 'HCM-Q8-BD',
    name: 'Phường Bình Đông',
    type: 'phuong',
    area: 'Khu vực 8 (Quận 8 cũ)',
    formerWards: 'Phường 11, 12, 13, 15, 16 (Quận 8)',
  },

  // --- Khu vực Quận 10 cũ ---
  {
    code: 'HCM-Q10-DH',
    name: 'Phường Diên Hồng',
    type: 'phuong',
    area: 'Khu vực 10 (Quận 10 cũ)',
    formerWards: 'Phường 1, 2, 4, 9, 10 (Quận 10)',
  },
  {
    code: 'HCM-Q10-VL',
    name: 'Phường Vườn Lài',
    type: 'phuong',
    area: 'Khu vực 10 (Quận 10 cũ)',
    formerWards: 'Phường 5, 6, 7, 8, 11 (Quận 10)',
  },
  {
    code: 'HCM-Q10-HH',
    name: 'Phường Hòa Hưng',
    type: 'phuong',
    area: 'Khu vực 10 (Quận 10 cũ)',
    formerWards: 'Phường 12, 13, 14, 15 (Quận 10)',
  },

  // --- Khu vực Quận 11 cũ ---
  {
    code: 'HCM-Q11-MP',
    name: 'Phường Minh Phụng',
    type: 'phuong',
    area: 'Khu vực 11 (Quận 11 cũ)',
    formerWards: 'Phường 1, 2, 7, 16 (Quận 11)',
  },
  {
    code: 'HCM-Q11-BT',
    name: 'Phường Bình Thới',
    type: 'phuong',
    area: 'Khu vực 11 (Quận 11 cũ)',
    formerWards: 'Phường 8, 9, 11, 12 (Quận 11)',
  },
  {
    code: 'HCM-Q11-HB',
    name: 'Phường Hòa Bình',
    type: 'phuong',
    area: 'Khu vực 11 (Quận 11 cũ)',
    formerWards: 'Phường 3, 5, 10, 14 (Quận 11)',
  },
  {
    code: 'HCM-Q11-PT',
    name: 'Phường Phú Thọ',
    type: 'phuong',
    area: 'Khu vực 11 (Quận 11 cũ)',
    formerWards: 'Phường 4, 6, 13, 15 (Quận 11)',
  },

  // --- Khu vực Quận 12 cũ ---
  {
    code: 'HCM-Q12-DHT',
    name: 'Phường Đông Hưng Thuận',
    type: 'phuong',
    area: 'Khu vực 12 (Quận 12 cũ)',
    formerWards: 'Phường Đông Hưng Thuận, Tân Hưng Thuận',
  },
  {
    code: 'HCM-Q12-TMT',
    name: 'Phường Trung Mỹ Tây',
    type: 'phuong',
    area: 'Khu vực 12 (Quận 12 cũ)',
    formerWards: 'Phường Trung Mỹ Tây, Tân Chánh Hiệp',
  },
  {
    code: 'HCM-Q12-TTH',
    name: 'Phường Tân Thới Hiệp',
    type: 'phuong',
    area: 'Khu vực 12 (Quận 12 cũ)',
    formerWards: 'Phường Tân Thới Hiệp, Hiệp Thành',
  },
  {
    code: 'HCM-Q12-TA',
    name: 'Phường Thới An',
    type: 'phuong',
    area: 'Khu vực 12 (Quận 12 cũ)',
    formerWards: 'Phường Thới An, Thạnh Xuân',
  },
  {
    code: 'HCM-Q12-APD',
    name: 'Phường An Phú Đông',
    type: 'phuong',
    area: 'Khu vực 12 (Quận 12 cũ)',
    formerWards: 'Phường An Phú Đông, Thạnh Lộc',
  },

  // --- Khu vực Quận Bình Tân cũ ---
  {
    code: 'HCM-BTAN-AL',
    name: 'Phường An Lạc',
    type: 'phuong',
    area: 'Khu vực Bình Tân (cũ)',
    formerWards: 'Phường An Lạc, An Lạc A',
  },
  {
    code: 'HCM-BTAN-BT',
    name: 'Phường Bình Tân',
    type: 'phuong',
    area: 'Khu vực Bình Tân (cũ)',
    formerWards: 'Phường Tân Tạo A, Bình Trị Đông B',
  },
  {
    code: 'HCM-BTAN-TT',
    name: 'Phường Tân Tạo',
    type: 'phuong',
    area: 'Khu vực Bình Tân (cũ)',
    formerWards: 'Phường Tân Tạo',
  },
  {
    code: 'HCM-BTAN-BTD',
    name: 'Phường Bình Trị Đông',
    type: 'phuong',
    area: 'Khu vực Bình Tân (cũ)',
    formerWards: 'Phường Bình Trị Đông, Bình Trị Đông A',
  },
  {
    code: 'HCM-BTAN-BHH',
    name: 'Phường Bình Hưng Hòa',
    type: 'phuong',
    area: 'Khu vực Bình Tân (cũ)',
    formerWards: 'Phường Bình Hưng Hòa, Bình Hưng Hòa A, Bình Hưng Hòa B',
  },

  // --- Khu vực Quận Bình Thạnh cũ ---
  {
    code: 'HCM-BTH-GD',
    name: 'Phường Gia Định',
    type: 'phuong',
    area: 'Khu vực Bình Thạnh (cũ)',
    formerWards: 'Phường 1, 2, 3, 7, 14 (Bình Thạnh)',
  },
  {
    code: 'HCM-BTH-BT',
    name: 'Phường Bình Thạnh',
    type: 'phuong',
    area: 'Khu vực Bình Thạnh (cũ)',
    formerWards: 'Phường 11, 12, 13, 24, 26 (Bình Thạnh)',
  },
  {
    code: 'HCM-BTH-BLT',
    name: 'Phường Bình Lợi Trung',
    type: 'phuong',
    area: 'Khu vực Bình Thạnh (cũ)',
    formerWards: 'Phường 5, 6, 25 (Bình Thạnh)',
  },
  {
    code: 'HCM-BTH-TMT',
    name: 'Phường Thạnh Mỹ Tây',
    type: 'phuong',
    area: 'Khu vực Bình Thạnh (cũ)',
    formerWards: 'Phường 19, 21, 22 (Bình Thạnh)',
  },
  {
    code: 'HCM-BTH-BQ',
    name: 'Phường Bình Quới',
    type: 'phuong',
    area: 'Khu vực Bình Thạnh (cũ)',
    formerWards: 'Phường 27, 28 (Bình Thạnh)',
  },

  // --- Khu vực Quận Gò Vấp cũ ---
  {
    code: 'HCM-GV-HT',
    name: 'Phường Hạnh Thông',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 1, 3, 4, 7 (Gò Vấp)',
  },
  {
    code: 'HCM-GV-AN',
    name: 'Phường An Nhơn',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 5, 6 (Gò Vấp)',
  },
  {
    code: 'HCM-GV-GV',
    name: 'Phường Gò Vấp',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 8, 9, 10, 11 (Gò Vấp)',
  },
  {
    code: 'HCM-GV-AHD',
    name: 'Phường An Hội Đông',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 15, 16 (Gò Vấp)',
  },
  {
    code: 'HCM-GV-TTH',
    name: 'Phường Thông Tây Hội',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 13, 14 (Gò Vấp)',
  },
  {
    code: 'HCM-GV-AHT',
    name: 'Phường An Hội Tây',
    type: 'phuong',
    area: 'Khu vực Gò Vấp (cũ)',
    formerWards: 'Phường 12, 17 (Gò Vấp)',
  },

  // --- Khu vực Quận Phú Nhuận cũ ---
  {
    code: 'HCM-PN-DN',
    name: 'Phường Đức Nhuận',
    type: 'phuong',
    area: 'Khu vực Phú Nhuận (cũ)',
    formerWards: 'Phường 1, 2, 7 (Phú Nhuận)',
  },
  {
    code: 'HCM-PN-CK',
    name: 'Phường Cầu Kiệu',
    type: 'phuong',
    area: 'Khu vực Phú Nhuận (cũ)',
    formerWards: 'Phường 3, 4, 5 (Phú Nhuận)',
  },
  {
    code: 'HCM-PN-PN',
    name: 'Phường Phú Nhuận',
    type: 'phuong',
    area: 'Khu vực Phú Nhuận (cũ)',
    formerWards: 'Phường 8, 9, 10, 11, 13, 15, 17 (Phú Nhuận)',
  },

  // --- Khu vực Quận Tân Bình cũ ---
  {
    code: 'HCM-TB-TSH',
    name: 'Phường Tân Sơn Hòa',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 1, 2, 3 (Tân Bình)',
  },
  {
    code: 'HCM-TB-TSN',
    name: 'Phường Tân Sơn Nhất',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 4, 5, 7 (Tân Bình)',
  },
  {
    code: 'HCM-TB-TH',
    name: 'Phường Tân Hòa',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 6, 8, 9 (Tân Bình)',
  },
  {
    code: 'HCM-TB-BH',
    name: 'Phường Bảy Hiền',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 10, 11 (Tân Bình)',
  },
  {
    code: 'HCM-TB-TB',
    name: 'Phường Tân Bình',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 12, 13, 14 (Tân Bình)',
  },
  {
    code: 'HCM-TB-TS',
    name: 'Phường Tân Sơn',
    type: 'phuong',
    area: 'Khu vực Tân Bình (cũ)',
    formerWards: 'Phường 15 (Tân Bình)',
  },

  // --- Khu vực Quận Tân Phú cũ ---
  {
    code: 'HCM-TP-TT',
    name: 'Phường Tây Thạnh',
    type: 'phuong',
    area: 'Khu vực Tân Phú (cũ)',
    formerWards: 'Phường Tây Thạnh, Sơn Kỳ',
  },
  {
    code: 'HCM-TP-TSN',
    name: 'Phường Tân Sơn Nhì',
    type: 'phuong',
    area: 'Khu vực Tân Phú (cũ)',
    formerWards: 'Phường Tân Sơn Nhì, Tân Quý',
  },
  {
    code: 'HCM-TP-PTH',
    name: 'Phường Phú Thọ Hòa',
    type: 'phuong',
    area: 'Khu vực Tân Phú (cũ)',
    formerWards: 'Phường Phú Thọ Hòa, Phú Thạnh',
  },
  {
    code: 'HCM-TP-TP',
    name: 'Phường Tân Phú',
    type: 'phuong',
    area: 'Khu vực Tân Phú (cũ)',
    formerWards: 'Phường Tân Thành, Hòa Thạnh',
  },
  {
    code: 'HCM-TP-PT',
    name: 'Phường Phú Thạnh',
    type: 'phuong',
    area: 'Khu vực Tân Phú (cũ)',
    formerWards: 'Phường Phú Trung, Hiệp Tân',
  },

  // --- Khu vực Thành phố Thủ Đức ---
  {
    code: 'HCM-TDU-HB',
    name: 'Phường Hiệp Bình',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Hiệp Bình Chánh, Hiệp Bình Phước',
  },
  {
    code: 'HCM-TDU-TD',
    name: 'Phường Thủ Đức',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Linh Chiểu, Trường Thọ',
  },
  {
    code: 'HCM-TDU-TB',
    name: 'Phường Tam Bình',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Tam Bình, Tam Phú',
  },
  {
    code: 'HCM-TDU-LX',
    name: 'Phường Linh Xuân',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Linh Xuân, Linh Trung',
  },
  {
    code: 'HCM-TDU-TNP',
    name: 'Phường Tăng Nhơn Phú',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Tăng Nhơn Phú A, Tăng Nhơn Phú B',
  },
  {
    code: 'HCM-TDU-LB',
    name: 'Phường Long Bình',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Long Bình, Long Thạnh Mỹ',
  },
  {
    code: 'HCM-TDU-LP',
    name: 'Phường Long Phước',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Long Phước',
  },
  {
    code: 'HCM-TDU-LT',
    name: 'Phường Long Trường',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Long Trường, Trường Thạnh',
  },
  {
    code: 'HCM-TDU-CL',
    name: 'Phường Cát Lái',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Cát Lái, Thạnh Mỹ Lợi',
  },
  {
    code: 'HCM-TDU-BT',
    name: 'Phường Bình Trưng',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Bình Trưng Đông, Bình Trưng Tây',
  },
  {
    code: 'HCM-TDU-PL',
    name: 'Phường Phước Long',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường Phước Long A, Phước Long B',
  },
  {
    code: 'HCM-TDU-AK',
    name: 'Phường An Khánh',
    type: 'phuong',
    area: 'Khu vực TP. Thủ Đức',
    formerWards: 'Phường An Khánh, Thủ Thiêm, An Lợi Đông',
  },

  // --- Khu vực Dĩ An / Thuận An / Thủ Dầu Một / Bến Cát / Tân Uyên ---
  {
    code: 'HCM-BD-DH',
    name: 'Phường Đông Hòa',
    type: 'phuong',
    area: 'Khu vực Dĩ An',
    formerWards: 'Phường Đông Hòa, Bình An',
  },
  {
    code: 'HCM-BD-DA',
    name: 'Phường Dĩ An',
    type: 'phuong',
    area: 'Khu vực Dĩ An',
    formerWards: 'Phường Dĩ An, Tân Bình',
  },
  {
    code: 'HCM-BD-TDH',
    name: 'Phường Tân Đông Hiệp',
    type: 'phuong',
    area: 'Khu vực Dĩ An',
    formerWards: 'Phường Tân Đông Hiệp, Bình Thắng',
  },
  {
    code: 'HCM-BD-AP',
    name: 'Phường An Phú',
    type: 'phuong',
    area: 'Khu vực Thuận An',
    formerWards: 'Phường An Phú, Thuận Giao',
  },
  {
    code: 'HCM-BD-BH',
    name: 'Phường Bình Hòa',
    type: 'phuong',
    area: 'Khu vực Thuận An',
    formerWards: 'Phường Bình Hòa, Vĩnh Phú',
  },
  {
    code: 'HCM-BD-LT',
    name: 'Phường Lái Thiêu',
    type: 'phuong',
    area: 'Khu vực Thuận An',
    formerWards: 'Phường Lái Thiêu, Bình Nhâm',
  },
  {
    code: 'HCM-BD-TA',
    name: 'Phường Thuận An',
    type: 'phuong',
    area: 'Khu vực Thuận An',
    formerWards: 'Phường An Thạnh, Hưng Định',
  },
  {
    code: 'HCM-BD-TG',
    name: 'Phường Thuận Giao',
    type: 'phuong',
    area: 'Khu vực Thuận An',
    formerWards: 'Phường Thuận Giao',
  },
  {
    code: 'HCM-BD-TDM',
    name: 'Phường Thủ Dầu Một',
    type: 'phuong',
    area: 'Khu vực Thủ Dầu Một',
    formerWards: 'Phường Phú Cường, Phú Hòa',
  },
  {
    code: 'HCM-BD-PL',
    name: 'Phường Phú Lợi',
    type: 'phuong',
    area: 'Khu vực Thủ Dầu Một',
    formerWards: 'Phường Phú Lợi, Hiệp Thành',
  },
  {
    code: 'HCM-BD-CH',
    name: 'Phường Chánh Hiệp',
    type: 'phuong',
    area: 'Khu vực Thủ Dầu Một',
    formerWards: 'Phường Chánh Nghĩa, Hiệp An',
  },
  {
    code: 'HCM-BD-BDU',
    name: 'Phường Bình Dương',
    type: 'phuong',
    area: 'Khu vực Thủ Dầu Một',
    formerWards: 'Phường Hòa Phú, Phú Tân',
  },
  {
    code: 'HCM-BD-HL',
    name: 'Phường Hòa Lợi',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường Hòa Lợi, Tân Định',
  },
  {
    code: 'HCM-BD-PA',
    name: 'Phường Phú An',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường Phú An, An Tây',
  },
  {
    code: 'HCM-BD-TN',
    name: 'Phường Tây Nam',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường An Điền',
  },
  {
    code: 'HCM-BD-LN',
    name: 'Phường Long Nguyên',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Xã Long Nguyên',
  },
  {
    code: 'HCM-BD-BC',
    name: 'Phường Bến Cát',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường Mỹ Phước',
  },
  {
    code: 'HCM-BD-CPH',
    name: 'Phường Chánh Phú Hòa',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường Chánh Phú Hòa',
  },
  {
    code: 'HCM-BD-THO',
    name: 'Phường Thới Hòa',
    type: 'phuong',
    area: 'Khu vực Bến Cát',
    formerWards: 'Phường Thới Hòa',
  },
  {
    code: 'HCM-BD-VT',
    name: 'Phường Vĩnh Tân',
    type: 'phuong',
    area: 'Khu vực Tân Uyên',
    formerWards: 'Phường Vĩnh Tân, Phú Chánh',
  },
  {
    code: 'HCM-BD-BC2',
    name: 'Phường Bình Cơ',
    type: 'phuong',
    area: 'Khu vực Tân Uyên',
    formerWards: 'Phường Tân Vĩnh Hiệp',
  },
  {
    code: 'HCM-BD-TU',
    name: 'Phường Tân Uyên',
    type: 'phuong',
    area: 'Khu vực Tân Uyên',
    formerWards: 'Phường Uyên Hưng, Tân Phước Khánh',
  },
  {
    code: 'HCM-BD-TH2',
    name: 'Phường Tân Hiệp',
    type: 'phuong',
    area: 'Khu vực Tân Uyên',
    formerWards: 'Phường Tân Hiệp, Khánh Bình',
  },
  {
    code: 'HCM-BD-TK',
    name: 'Phường Tân Khánh',
    type: 'phuong',
    area: 'Khu vực Tân Uyên',
    formerWards: 'Phường Thái Hòa, Thạnh Phước',
  },

  // --- Khu vực Vũng Tàu / Bà Rịa / Phú Mỹ ---
  {
    code: 'HCM-VT-VT',
    name: 'Phường Vũng Tàu',
    type: 'phuong',
    area: 'Khu vực Vũng Tàu',
    formerWards: 'Phường 1, 2, 3, 4, 5 (Vũng Tàu)',
  },
  {
    code: 'HCM-VT-TT',
    name: 'Phường Tam Thắng',
    type: 'phuong',
    area: 'Khu vực Vũng Tàu',
    formerWards: 'Phường 7, 8, 9, Thắng Nhì',
  },
  {
    code: 'HCM-VT-RD',
    name: 'Phường Rạch Dừa',
    type: 'phuong',
    area: 'Khu vực Vũng Tàu',
    formerWards: 'Phường 10, 11, Rạch Dừa',
  },
  {
    code: 'HCM-VT-PT',
    name: 'Phường Phước Thắng',
    type: 'phuong',
    area: 'Khu vực Vũng Tàu',
    formerWards: 'Phường 12, Thắng Nhất',
  },
  {
    code: 'HCM-VT-LH',
    name: 'Phường Long Hương',
    type: 'phuong',
    area: 'Khu vực Bà Rịa',
    formerWards: 'Phường Long Hương, Kim Dinh',
  },
  {
    code: 'HCM-VT-BR',
    name: 'Phường Bà Rịa',
    type: 'phuong',
    area: 'Khu vực Bà Rịa',
    formerWards: 'Phường Phước Trung, Phước Hiệp, Phước Nguyên',
  },
  {
    code: 'HCM-VT-TL',
    name: 'Phường Tam Long',
    type: 'phuong',
    area: 'Khu vực Bà Rịa',
    formerWards: 'Phường Long Tâm, Long Toàn',
  },
  {
    code: 'HCM-VT-THAI',
    name: 'Phường Tân Hải',
    type: 'phuong',
    area: 'Khu vực Phú Mỹ',
    formerWards: 'Xã Tân Hải, Tân Hòa',
  },
  {
    code: 'HCM-VT-TPHU',
    name: 'Phường Tân Phước',
    type: 'phuong',
    area: 'Khu vực Phú Mỹ',
    formerWards: 'Phường Tân Phước, Phước Hòa',
  },
  {
    code: 'HCM-VT-PM',
    name: 'Phường Phú Mỹ',
    type: 'phuong',
    area: 'Khu vực Phú Mỹ',
    formerWards: 'Phường Phú Mỹ, Mỹ Xuân',
  },
  {
    code: 'HCM-VT-TTH',
    name: 'Phường Tân Thành',
    type: 'phuong',
    area: 'Khu vực Phú Mỹ',
    formerWards: 'Phường Hắc Dịch, Xã Tóc Tiên',
  },

  // --- Khu vực Huyện Bình Chánh cũ ---
  {
    code: 'HCM-BC-VL',
    name: 'Xã Vĩnh Lộc',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Vĩnh Lộc A, Vĩnh Lộc B',
  },
  {
    code: 'HCM-BC-TVL',
    name: 'Xã Tân Vĩnh Lộc',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Phạm Văn Hai, Bình Lợi',
  },
  {
    code: 'HCM-BC-BL',
    name: 'Xã Bình Lợi',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Lê Minh Xuân, Tân Nhựt',
  },
  {
    code: 'HCM-BC-TN',
    name: 'Xã Tân Nhựt',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Thị trấn Tân Túc, Xã Tân Kiên',
  },
  {
    code: 'HCM-BC-BC',
    name: 'Xã Bình Chánh',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Bình Chánh, An Phú Tây',
  },
  {
    code: 'HCM-BC-HL',
    name: 'Xã Hưng Long',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Hưng Long, Quy Đức, Đa Phước',
  },
  {
    code: 'HCM-BC-BH',
    name: 'Xã Bình Hưng',
    type: 'xa',
    area: 'Khu vực Bình Chánh (cũ)',
    formerWards: 'Xã Bình Hưng, Phong Phú',
  },

  // --- Khu vực Huyện Cần Giờ cũ ---
  {
    code: 'HCM-CG-BK',
    name: 'Xã Bình Khánh',
    type: 'xa',
    area: 'Khu vực Cần Giờ (cũ)',
    formerWards: 'Xã Bình Khánh',
  },
  {
    code: 'HCM-CG-ATD',
    name: 'Xã An Thới Đông',
    type: 'xa',
    area: 'Khu vực Cần Giờ (cũ)',
    formerWards: 'Xã An Thới Đông, Tam Thôn Hiệp',
  },
  {
    code: 'HCM-CG-CG',
    name: 'Xã Cần Giờ',
    type: 'xa',
    area: 'Khu vực Cần Giờ (cũ)',
    formerWards: 'Thị trấn Cần Thạnh, Xã Long Hòa',
  },
  {
    code: 'HCM-CG-TA',
    name: 'Xã Thạnh An',
    type: 'xa',
    area: 'Khu vực Cần Giờ (cũ)',
    formerWards: 'Xã đảo Thạnh An',
  },

  // --- Khu vực Huyện Củ Chi cũ ---
  {
    code: 'HCM-CC-CC',
    name: 'Xã Củ Chi',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Thị trấn Củ Chi, Xã Tân Thạnh Đông',
  },
  {
    code: 'HCM-CC-TAH',
    name: 'Xã Tân An Hội',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã Tân An Hội, Tân Thông Hội',
  },
  {
    code: 'HCM-CC-TM',
    name: 'Xã Thái Mỹ',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã Thái Mỹ, Phước Hiệp',
  },
  {
    code: 'HCM-CC-ANT',
    name: 'Xã An Nhơn Tây',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã An Nhơn Tây, An Phú',
  },
  {
    code: 'HCM-CC-ND',
    name: 'Xã Nhuận Đức',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã Nhuận Đức, Phạm Văn Cội',
  },
  {
    code: 'HCM-CC-PHD',
    name: 'Xã Phú Hòa Đông',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã Phú Hòa Đông, Trung An',
  },
  {
    code: 'HCM-CC-BM',
    name: 'Xã Bình Mỹ',
    type: 'xa',
    area: 'Khu vực Củ Chi (cũ)',
    formerWards: 'Xã Bình Mỹ, Hòa Phú',
  },

  // --- Khu vực Huyện Hóc Môn cũ ---
  {
    code: 'HCM-HM-DT',
    name: 'Xã Đông Thạnh',
    type: 'xa',
    area: 'Khu vực Hóc Môn (cũ)',
    formerWards: 'Xã Đông Thạnh, Nhị Bình',
  },
  {
    code: 'HCM-HM-HM',
    name: 'Xã Hóc Môn',
    type: 'xa',
    area: 'Khu vực Hóc Môn (cũ)',
    formerWards: 'Thị trấn Hóc Môn, Xã Thới Tam Thôn',
  },
  {
    code: 'HCM-HM-XTS',
    name: 'Xã Xuân Thới Sơn',
    type: 'xa',
    area: 'Khu vực Hóc Môn (cũ)',
    formerWards: 'Xã Xuân Thới Sơn, Xuân Thới Thượng',
  },
  {
    code: 'HCM-HM-BD',
    name: 'Xã Bà Điểm',
    type: 'xa',
    area: 'Khu vực Hóc Môn (cũ)',
    formerWards: 'Xã Bà Điểm, Tân Xuân',
  },

  // --- Khu vực Huyện Nhà Bè cũ ---
  {
    code: 'HCM-NB-NB',
    name: 'Xã Nhà Bè',
    type: 'xa',
    area: 'Khu vực Nhà Bè (cũ)',
    formerWards: 'Thị trấn Nhà Bè, Xã Phước Kiển, Phước Lộc',
  },
  {
    code: 'HCM-NB-HP',
    name: 'Xã Hiệp Phước',
    type: 'xa',
    area: 'Khu vực Nhà Bè (cũ)',
    formerWards: 'Xã Hiệp Phước, Long Thới, Nhơn Đức',
  },

  // --- Khu vực các xã thuộc Bắc Tân Uyên, Phú Giáo, Bàu Bàng, Dầu Tiếng ---
  {
    code: 'HCM-BD-TTAN',
    name: 'Xã Thường Tân',
    type: 'xa',
    area: 'Khu vực Bắc Tân Uyên',
    formerWards: 'Xã Thường Tân, Tân Mỹ',
  },
  {
    code: 'HCM-BD-BTU',
    name: 'Xã Bắc Tân Uyên',
    type: 'xa',
    area: 'Khu vực Bắc Tân Uyên',
    formerWards: 'Thị trấn Tân Thành, Xã Đất Cuốc',
  },
  {
    code: 'HCM-BD-PG',
    name: 'Xã Phú Giáo',
    type: 'xa',
    area: 'Khu vực Phú Giáo',
    formerWards: 'Thị trấn Phước Vĩnh',
  },
  {
    code: 'HCM-BD-PH',
    name: 'Xã Phước Hòa',
    type: 'xa',
    area: 'Khu vực Phú Giáo',
    formerWards: 'Xã Phước Hòa, Vĩnh Hòa',
  },
  {
    code: 'HCM-BD-PT',
    name: 'Xã Phước Thành',
    type: 'xa',
    area: 'Khu vực Phú Giáo',
    formerWards: 'Xã Phước Thành, Tân Hiệp',
  },
  {
    code: 'HCM-BD-AL',
    name: 'Xã An Long',
    type: 'xa',
    area: 'Khu vực Phú Giáo',
    formerWards: 'Xã An Long, An Linh',
  },
  {
    code: 'HCM-BD-TVT',
    name: 'Xã Trừ Văn Thố',
    type: 'xa',
    area: 'Khu vực Bàu Bàng',
    formerWards: 'Xã Trừ Văn Thố, Cây Trường II',
  },
  {
    code: 'HCM-BD-BB',
    name: 'Xã Bàu Bàng',
    type: 'xa',
    area: 'Khu vực Bàu Bàng',
    formerWards: 'Thị trấn Lai Uyên, Xã Lai Hưng',
  },
  {
    code: 'HCM-BD-LH',
    name: 'Xã Long Hòa',
    type: 'xa',
    area: 'Khu vực Dầu Tiếng',
    formerWards: 'Xã Long Hòa, Long Tân',
  },
  {
    code: 'HCM-BD-TA2',
    name: 'Xã Thanh An',
    type: 'xa',
    area: 'Khu vực Dầu Tiếng',
    formerWards: 'Xã Thanh An, Thanh Tuyền',
  },
  {
    code: 'HCM-BD-DT',
    name: 'Xã Dầu Tiếng',
    type: 'xa',
    area: 'Khu vực Dầu Tiếng',
    formerWards: 'Thị trấn Dầu Tiếng, Xã Định An',
  },
  {
    code: 'HCM-BD-MT',
    name: 'Xã Minh Thạnh',
    type: 'xa',
    area: 'Khu vực Dầu Tiếng',
    formerWards: 'Xã Minh Thạnh, Minh Tân',
  },

  // --- Khu vực các xã thuộc Châu Đức, Long Đất, Xuyên Mộc ---
  {
    code: 'HCM-VT-LS',
    name: 'Xã Long Sơn',
    type: 'xa',
    area: 'Khu vực Vũng Tàu',
    formerWards: 'Xã đảo Long Sơn',
  },
  {
    code: 'HCM-VT-CP',
    name: 'Xã Châu Pha',
    type: 'xa',
    area: 'Khu vực Phú Mỹ',
    formerWards: 'Xã Châu Pha, Sông Xoài',
  },
  {
    code: 'HCM-VT-LHD',
    name: 'Xã Long Hải',
    type: 'xa',
    area: 'Khu vực Long Đất',
    formerWards: 'Thị trấn Long Hải',
  },
  {
    code: 'HCM-VT-LD',
    name: 'Xã Long Điền',
    type: 'xa',
    area: 'Khu vực Long Đất',
    formerWards: 'Thị trấn Long Điền, Xã An Ngãi',
  },
  {
    code: 'HCM-VT-PH',
    name: 'Xã Phước Hải',
    type: 'xa',
    area: 'Khu vực Long Đất',
    formerWards: 'Thị trấn Phước Hải',
  },
  {
    code: 'HCM-VT-DD',
    name: 'Xã Đất Đỏ',
    type: 'xa',
    area: 'Khu vực Long Đất',
    formerWards: 'Thị trấn Đất Đỏ, Xã Phước Long Thọ',
  },
  {
    code: 'HCM-VT-NT',
    name: 'Xã Nghĩa Thành',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Xã Nghĩa Thành, Suối Nghệ',
  },
  {
    code: 'HCM-VT-NG',
    name: 'Xã Ngãi Giao',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Thị trấn Ngãi Giao, Xã Bình Ba',
  },
  {
    code: 'HCM-VT-KL',
    name: 'Xã Kim Long',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Xã Kim Long, Bàu Chinh',
  },
  {
    code: 'HCM-VT-CD',
    name: 'Xã Châu Đức',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Xã Láng Lớn, Xà Bang',
  },
  {
    code: 'HCM-VT-BG',
    name: 'Xã Bình Giã',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Xã Bình Giã, Bình Trung',
  },
  {
    code: 'HCM-VT-XS',
    name: 'Xã Xuân Sơn',
    type: 'xa',
    area: 'Khu vực Châu Đức',
    formerWards: 'Xã Xuân Sơn, Sơn Bình',
  },
  {
    code: 'HCM-VT-HT',
    name: 'Xã Hồ Tràm',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Xã Phước Thuận',
  },
  {
    code: 'HCM-VT-XM',
    name: 'Xã Xuyên Mộc',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Thị trấn Phước Bửu, Xã Xuyên Mộc',
  },
  {
    code: 'HCM-VT-HH',
    name: 'Xã Hòa Hội',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Xã Hòa Hội, Hòa Hiệp',
  },
  {
    code: 'HCM-VT-BL',
    name: 'Xã Bàu Lâm',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Xã Bàu Lâm, Tân Lâm',
  },
  {
    code: 'HCM-VT-HHI',
    name: 'Xã Hòa Hiệp',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Xã Hòa Hiệp',
  },
  {
    code: 'HCM-VT-BC',
    name: 'Xã Bình Châu',
    type: 'xa',
    area: 'Khu vực Xuyên Mộc',
    formerWards: 'Xã Bình Châu',
  },

  // --- Đặc khu ---
  {
    code: 'HCM-DK-CD',
    name: 'Đặc khu Côn Đảo',
    type: 'dac_khu',
    area: 'Đặc khu Côn Đảo',
    formerWards: 'Huyện Côn Đảo cũ',
  },
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
