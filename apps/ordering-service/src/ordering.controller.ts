import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { OrderingService } from './ordering.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateStaffOrderDto } from './dto/create-staff-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { UpdatePaymentConfigDto } from './dto/update-payment-config.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import { RolesGuard, Roles, CurrentUser } from '@common';
import type { RequestUser } from '@common';

@Controller('orders')
export class OrderingController {
  constructor(private readonly orderingService: OrderingService) {}

  @Get('store-config')
  async getStoreConfig() {
    return this.orderingService.getStoreConfig();
  }

  @Patch('store-config')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async updateStoreConfig(
    @Body() dto: UpdateStoreConfigDto,
    @Headers('x-user-role') headerRole?: string,
    @CurrentUser('role') userRole?: string,
  ) {
    return this.orderingService.updateStoreConfig(dto, userRole || headerRole);
  }

  @Get('payment-config')
  async getPaymentConfig() {
    return this.orderingService.getPaymentConfig();
  }

  @Patch('payment-config')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  async updatePaymentConfig(@Body() dto: UpdatePaymentConfigDto) {
    return this.orderingService.updatePaymentConfig(dto);
  }

  @Post()
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    if (!dto.idempotencyKey && idempotencyHeader) {
      dto.idempotencyKey = idempotencyHeader;
    }
    return this.orderingService.createOrder(dto);
  }

  @Post('staff')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER')
  @UseGuards(RolesGuard)
  async createStaffOrder(
    @Body() dto: CreateStaffOrderDto,
    @Headers('x-user-id') headerStaffId?: string,
    @Headers('x-user-role') headerRole?: string,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!dto.idempotencyKey && idempotencyHeader) {
      dto.idempotencyKey = idempotencyHeader;
    }
    const staffId = user?.sub || headerStaffId;
    const role = user?.role || headerRole;
    return user
      ? this.orderingService.createStaffOrder(dto, staffId, role, user)
      : this.orderingService.createStaffOrder(dto, staffId, role);
  }

  @Get('track')
  async trackOrder(
    @Query('code') code: string,
    @Query('token') token?: string,
    @Query('phone') phone?: string,
  ) {
    return this.orderingService.trackOrder(code, token, phone);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF')
  @UseGuards(RolesGuard)
  async getOrders(
    @Query() query: GetOrdersDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return user
      ? this.orderingService.getOrders(query, user)
      : this.orderingService.getOrders(query);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF')
  @UseGuards(RolesGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Headers('x-user-role') headerChangedBy?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const changedBy =
      user?.role ||
      (typeof headerChangedBy === 'string' && headerChangedBy) ||
      'STAFF';
    return user
      ? this.orderingService.updateOrderStatus(
          id,
          dto.status,
          dto.reason,
          changedBy,
          user,
        )
      : this.orderingService.updateOrderStatus(
          id,
          dto.status,
          dto.reason,
          changedBy,
        );
  }

  @Patch(':id/payment')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER')
  @UseGuards(RolesGuard)
  async updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return user
      ? this.orderingService.updatePaymentStatus(id, dto.paymentStatus, user)
      : this.orderingService.updatePaymentStatus(id, dto.paymentStatus);
  }

  @Post(':code/cancel')
  async cancelOrder(@Param('code') code: string, @Body() dto: CancelOrderDto) {
    return this.orderingService.cancelOrderByCustomer(
      code,
      dto.token,
      dto.reason,
    );
  }
}
