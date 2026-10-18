import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'Category name must be a string' })
  @IsNotEmpty({ message: 'Category name is required' })
  @MaxLength(100, { message: 'Category name cannot exceed 100 characters' })
  name!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
  parentId?: string;
}
