import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsNotEmpty({ message: 'Mã kho không được để trống' })
  @IsString({ message: 'Mã kho phải là chuỗi ký tự' })
  @MaxLength(50, { message: 'Mã kho tối đa 50 ký tự' })
  code: string;

  @IsNotEmpty({ message: 'Tên kho không được để trống' })
  @IsString({ message: 'Tên kho phải là chuỗi ký tự' })
  @MaxLength(160, { message: 'Tên kho tối đa 160 ký tự' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ kho phải là chuỗi ký tự' })
  address?: string;
}
