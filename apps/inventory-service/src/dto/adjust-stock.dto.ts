import {
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';
import { TransactionType, TransactionReason } from '@prisma/client';

export class AdjustStockDto {
  @IsNotEmpty({ message: 'Loại điều chỉnh kho không được để trống' })
  @IsEnum(TransactionType, { message: 'Loại điều chỉnh phải là IN hoặc OUT' })
  type: TransactionType;

  @IsNotEmpty({ message: 'Lý do điều chỉnh không được để trống' })
  @IsEnum(TransactionReason, {
    message: 'Lý do điều chỉnh không hợp lệ',
  })
  reason: TransactionReason;

  @IsNotEmpty({ message: 'Số lượng không được để trống' })
  @IsNumber({}, { message: 'Số lượng phải là số' })
  @IsPositive({ message: 'Số lượng phải lớn hơn 0' })
  quantity: number;

  @IsOptional()
  @IsNumber({}, { message: 'Đơn giá phải là số' })
  unitPrice?: number;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  note?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
