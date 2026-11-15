import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import {
  CreateShippingRuleDto,
  UpdateShippingRuleDto,
  CalculateShippingDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/shipping-rule.dto';
import { RolesGuard, Roles, CurrentUser } from '@common';
import type { RequestUser } from '@common';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('branches')
  async getBranches() {
    return this.shippingService.getBranches();
  }

  @Get('branches/manage')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async getBranchesForAdmin() {
    return this.shippingService.getBranchesForAdmin();
  }

  @Post('branches')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async createBranch(@Body() dto: CreateBranchDto) {
    return this.shippingService.createBranch(dto);
  }

  @Patch('branches/:id')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.shippingService.updateBranch(id, dto);
  }

  @Delete('branches/:id')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async deleteBranch(@Param('id') id: string) {
    return this.shippingService.deleteBranch(id);
  }

  @Get('locations')
  async getLocations() {
    return this.shippingService.getLocations();
  }

  @Get('calculate')
  async calculateShipping(@Query() query: CalculateShippingDto) {
    return this.shippingService.calculateShipping(query);
  }

  @Get('rules')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER')
  @UseGuards(RolesGuard)
  async getShippingRules(
    @Query('district') district?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.shippingService.getShippingRules(district, branchId, user);
  }

  @Post('rules')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async createShippingRule(@Body() dto: CreateShippingRuleDto) {
    return this.shippingService.upsertShippingRule(dto);
  }

  @Patch('rules/:id')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async updateShippingRule(
    @Param('id') id: string,
    @Body() dto: UpdateShippingRuleDto,
  ) {
    return this.shippingService.updateShippingRule(id, dto);
  }

  @Delete('rules/:id')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async deleteShippingRule(@Param('id') id: string) {
    return this.shippingService.deleteShippingRule(id);
  }
}
