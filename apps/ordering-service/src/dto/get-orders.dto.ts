import { IsOptional, IsEnum, IsUUID, Matches } from 'class-validator';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export class GetOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Trạng thái đơn hàng không hợp lệ' })
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'Trạng thái thanh toán không hợp lệ' })
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Mã chi nhánh (branchId) phải là UUID hợp lệ',
  })
  branchId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate phải có định dạng YYYY-MM-DD (ví dụ: 2026-11-04)',
  })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate phải có định dạng YYYY-MM-DD (ví dụ: 2026-11-04)',
  })
  endDate?: string;
}
