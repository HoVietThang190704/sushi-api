import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Chấp nhận số điện thoại di động Việt Nam (03x, 05x, 07x, 08x, 09x) hoặc hotline chuẩn (ví dụ 1900xxxx, 1800xxxx, hoặc số cố định 10-11 số)
export const VALID_PHONE_REGEX =
  /^(0|\+84)[35789]\d{8}$|^1[89]00\d{4,6}$|^(02\d{1,2})\d{7,8}$/;

export class HeroBannerItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp đường dẫn ảnh banner (URL/CDN)' })
  @MaxLength(2000)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  leadTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  highlightTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  kanjiWatermark?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStoreConfigDto {
  @IsOptional()
  @IsBoolean()
  customerOrderingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(VALID_PHONE_REGEX, {
    message:
      'Số điện thoại hotline không hợp lệ (hỗ trợ số di động 10 số, đầu số 1800/1900 hoặc số cố định)',
  })
  contactPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Tối đa 10 slide banner trên trang chủ' })
  @ValidateNested({ each: true })
  @Type(() => HeroBannerItemDto)
  heroBanners?: HeroBannerItemDto[];
}
