import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

// Chấp nhận số điện thoại di động Việt Nam (03x, 05x, 07x, 08x, 09x) hoặc hotline chuẩn (ví dụ 1900xxxx, 1800xxxx, hoặc số cố định 10-11 số)
export const VALID_PHONE_REGEX = /^(0|\+84)[35789]\d{8}$|^1[89]00\d{4,6}$|^(02\d{1,2})\d{7,8}$/;

export class UpdateStoreConfigDto {
  @IsOptional()
  @IsBoolean()
  customerOrderingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(VALID_PHONE_REGEX, {
    message: 'Số điện thoại hotline không hợp lệ (hỗ trợ số di động 10 số, đầu số 1800/1900 hoặc số cố định)',
  })
  contactPhone?: string;
}
