import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import {
  CreateShippingRuleDto,
  UpdateShippingRuleDto,
  CalculateShippingDto,
} from './dto/shipping-rule.dto';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('branches')
  async getBranches() {
    return this.shippingService.getBranches();
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
  async getShippingRules(
    @Query('district') district?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.shippingService.getShippingRules(district, branchId);
  }

  @Post('rules')
  async createShippingRule(@Body() dto: CreateShippingRuleDto) {
    return this.shippingService.upsertShippingRule(dto);
  }

  @Patch('rules/:id')
  async updateShippingRule(
    @Param('id') id: string,
    @Body() dto: UpdateShippingRuleDto,
  ) {
    return this.shippingService.updateShippingRule(id, dto);
  }

  @Delete('rules/:id')
  async deleteShippingRule(@Param('id') id: string) {
    return this.shippingService.deleteShippingRule(id);
  }
}
