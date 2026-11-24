import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum ProductTypeDto {
  SINGLE = 'SINGLE',
  COMBO = 'COMBO',
}

export class CreateProductDto {
  @IsString({ message: 'SKU must be a string' })
  @IsNotEmpty({ message: 'SKU is required' })
  @MaxLength(60, { message: 'SKU cannot exceed 60 characters' })
  sku!: string;

  @IsString({ message: 'Product name must be a string' })
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(160, { message: 'Product name cannot exceed 160 characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsEnum(ProductTypeDto, { message: 'Type must be either SINGLE or COMBO' })
  type?: ProductTypeDto;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsNumber({}, { message: 'Selling price must be a valid number' })
  @IsPositive({ message: 'Selling price must be greater than zero' })
  sellingPrice!: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Accompaniments cannot exceed 500 characters' })
  accompaniments?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'SKU must be a string' })
  @IsNotEmpty({ message: 'SKU cannot be empty' })
  @MaxLength(60, { message: 'SKU cannot exceed 60 characters' })
  sku?: string;

  @IsOptional()
  @IsString({ message: 'Product name must be a string' })
  @IsNotEmpty({ message: 'Product name cannot be empty' })
  @MaxLength(160, { message: 'Product name cannot exceed 160 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @IsEnum(ProductTypeDto, { message: 'Type must be either SINGLE or COMBO' })
  type?: ProductTypeDto;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string | null;

  @IsOptional()
  @IsNumber({}, { message: 'Selling price must be a valid number' })
  @IsPositive({ message: 'Selling price must be greater than zero' })
  sellingPrice?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Accompaniments cannot exceed 500 characters' })
  accompaniments?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
