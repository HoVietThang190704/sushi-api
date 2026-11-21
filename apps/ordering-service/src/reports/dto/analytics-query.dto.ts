import { IsOptional, Matches } from 'class-validator';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AnalyticsQueryDto {
  @IsOptional()
  @Matches(UUID_RE, { message: 'Mã chi nhánh (branchId) phải là UUID hợp lệ' })
  branchId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate phải có định dạng YYYY-MM-DD',
  })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate phải có định dạng YYYY-MM-DD',
  })
  endDate?: string;
}
