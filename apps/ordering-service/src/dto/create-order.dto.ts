import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsUUID,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
