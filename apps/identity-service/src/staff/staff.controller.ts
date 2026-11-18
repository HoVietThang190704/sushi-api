import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles, RolesGuard } from '@common';
import type { RequestUser } from '@common';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  ListStaffQueryDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto/staff.dto';

@Controller('staff')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
@UseGuards(RolesGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query() query: ListStaffQueryDto) {
    return this.staffService.list(actor, query);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(actor, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staffService.setStatus(actor, id, dto.isActive);
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.resetPassword(actor, id);
  }
}
