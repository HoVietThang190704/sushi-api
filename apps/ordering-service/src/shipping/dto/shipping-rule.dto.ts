import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateShippingRuleDto {
  @IsUUID()
  @IsNotEmpty()
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

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
