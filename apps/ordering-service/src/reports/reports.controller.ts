import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles, RolesGuard } from '@common';
import type { RequestUser } from '@common';
import { ReportsService } from './reports.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * Mounted under the existing `/orders` prefix so the gateway's
 * `/api/orders` proxy needs no change. Registered before the
 * OrderingController so `analytics` is never captured by a `:id` route.
 */
@Controller('orders/analytics')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
@UseGuards(RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  getAnalytics(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reportsService.getAnalytics(query, user);
  }
}
