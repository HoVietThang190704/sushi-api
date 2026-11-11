import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePaymentConfigDto {
  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  accountHolder?: string;

  @IsString()
  @IsOptional()
  qrImageUrl?: string;

  @IsString()
  @IsOptional()
  transferSyntax?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
