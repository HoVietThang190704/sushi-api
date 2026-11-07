import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
