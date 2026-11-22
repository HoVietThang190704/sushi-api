import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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

export class CuratedCategoryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên danh mục nổi bật' })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  japanese?: string;

  @IsOptional()
  @IsString()
  @MaxLength(350)
  desc?: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp đường dẫn ảnh danh mục (URL/CDN)' })
  @MaxLength(2000)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetCategory?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CulinaryNewsItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tiêu đề bài viết / ưu đãi' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp đường dẫn ảnh bài viết (URL/CDN)' })
  @MaxLength(2000)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BrandStoryPillarDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tiêu đề giá trị cốt lõi' })
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mô tả giá trị cốt lõi' })
  @MaxLength(400)
  description!: string;
}

export class BrandStoryTileDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp đường dẫn ảnh nghệ thuật (URL/CDN)' })
  @MaxLength(2000)
  imageUrl!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập chú thích ảnh nghệ thuật' })
  @MaxLength(120)
  caption!: string;
}

export class BrandStoryConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cardBadge?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cardTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  cardQuote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cardSignature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cardKanji?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  storyLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  storyHeading?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  storyParagraph1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  storyParagraph2?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => BrandStoryPillarDto)
  pillars?: BrandStoryPillarDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => BrandStoryTileDto)
  craftTiles?: BrandStoryTileDto[];
}

export class FooterConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  patternPreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customBgImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bgColor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overlayOpacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(100)
  patternOpacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  brandDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  openingDays?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  openingHours?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  closingNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  copyrightText?: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandStoryConfigDto)
  brandStory?: BrandStoryConfigDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'Tối đa 12 danh mục thực đơn đặc sắc trên trang chủ' })
  @ValidateNested({ each: true })
  @Type(() => CuratedCategoryItemDto)
  curatedCategories?: CuratedCategoryItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'Tối đa 12 bài tin tức & khuyến mãi trên trang chủ' })
  @ValidateNested({ each: true })
  @Type(() => CulinaryNewsItemDto)
  culinaryNews?: CulinaryNewsItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FooterConfigDto)
  footerConfig?: FooterConfigDto;
}
