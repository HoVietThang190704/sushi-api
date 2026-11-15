import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEmail,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './create-order.dto';

export class CreateStaffOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống' })
  customerName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại khách hàng không được để trống' })
  @Matches(/^(0|\+84)[35789]\d{8}$/, {
    message:
      'Số điện thoại không hợp lệ (yêu cầu số điện thoại Việt Nam 10 chữ số)',
  })
  customerPhone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  customerEmail?: string;

  @IsString()
  @IsNotEmpty({ message: 'Địa chỉ nhận hàng không được để trống' })
  address!: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsString()
  @IsNotEmpty({ message: 'Quận/Huyện không được để trống' })
  district!: string;

  @IsString()
  @IsNotEmpty({ message: 'Phường/Xã không được để trống' })
  ward!: string;

  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Mã chi nhánh phục vụ không hợp lệ',
  })
  @IsNotEmpty({ message: 'Vui lòng chọn chi nhánh phục vụ' })
  branchId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsArray({ message: 'Danh sách món ăn phải là một mảng' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
