import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'Category name must be a string' })
  @IsNotEmpty({ message: 'Category name is required' })
  @MaxLength(100, { message: 'Category name cannot exceed 100 characters' })
  name!: string;

  @IsOptional()
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be >= 0' })
  sortOrder?: number;

  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString({ message: 'Category name must be a string' })
  @IsNotEmpty({ message: 'Category name cannot be empty' })
  @MaxLength(100, { message: 'Category name cannot exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be >= 0' })
  sortOrder?: number;

  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
  parentId?: string | null;
}

export class ReorderCategoryItemDto {
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  id!: string;

  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be >= 0' })
  sortOrder!: number;
}

export class ReorderCategoriesDto {
  @IsArray({ message: 'Items must be an array' })
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  items!: ReorderCategoryItemDto[];
}
