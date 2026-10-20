import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TransactionType } from '@prisma/client';

export class TransactionQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID()
  ingredientId?: string;
}
