import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateBranchDto {
  @IsString({ message: 'Mã chi nhánh phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã chi nhánh không được để trống' })
  @MaxLength(50, { message: 'Mã chi nhánh tối đa 50 ký tự' })
  code!: string;

  @IsString({ message: 'Tên chi nhánh phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên chi nhánh không được để trống' })
  @MaxLength(160, { message: 'Tên chi nhánh tối đa 160 ký tự' })
  name!: string;

  @IsString({ message: 'Địa chỉ chi nhánh phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Địa chỉ chi nhánh không được để trống' })
  address!: string;

  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @MaxLength(30, { message: 'Số điện thoại tối đa 30 ký tự' })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(UUID_REGEX, { message: 'warehouseId phải là UUID hợp lệ' })
  warehouseId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString({ message: 'Mã chi nhánh phải là chuỗi ký tự' })
  @MaxLength(50, { message: 'Mã chi nhánh tối đa 50 ký tự' })
  code?: string;

  @IsOptional()
  @IsString({ message: 'Tên chi nhánh phải là chuỗi ký tự' })
  @MaxLength(160, { message: 'Tên chi nhánh tối đa 160 ký tự' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ chi nhánh phải là chuỗi ký tự' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @MaxLength(30, { message: 'Số điện thoại tối đa 30 ký tự' })
  phone?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateShippingRuleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_REGEX, { message: 'branchId must be a valid UUID' })
  branchId!: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsNotEmpty()
  ward!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fee!: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateShippingRuleDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  fee?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CalculateShippingDto {
  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsNotEmpty()
  ward!: string;

  @IsString()
  @IsOptional()
  @Matches(UUID_REGEX, { message: 'branchId must be a valid UUID' })
  branchId?: string;
}
