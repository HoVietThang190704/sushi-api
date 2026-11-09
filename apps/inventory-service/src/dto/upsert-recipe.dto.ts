import {
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecipeItemInputDto {
  @IsNotEmpty({ message: 'Mã nguyên liệu không được để trống' })
  @IsUUID('4', { message: 'ID nguyên liệu phải là UUID hợp lệ' })
  ingredientId: string;

  @IsNotEmpty({ message: 'Định mức tiêu hao không được để trống' })
  @IsNumber({}, { message: 'Định mức tiêu hao phải là số' })
  @IsPositive({ message: 'Định mức tiêu hao phải lớn hơn 0' })
  quantity: number;
}

export class UpsertRecipeDto {
  @IsNotEmpty({ message: 'Mã món ăn không được để trống' })
  @IsUUID('4', { message: 'ID món ăn phải là UUID hợp lệ' })
  productId: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  notes?: string;

  @IsArray({ message: 'Danh sách nguyên liệu phải là mảng' })
  @ArrayMinSize(1, { message: 'Công thức phải có ít nhất 1 nguyên liệu' })
  @ValidateNested({ each: true })
  @Type(() => RecipeItemInputDto)
  items: RecipeItemInputDto[];
}
