import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { OrderingService } from './ordering.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';

@Controller('orders')
export class OrderingController {
  constructor(private readonly orderingService: OrderingService) {}

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

  @Get('track')
  async trackOrder(
    @Query('code') code: string,
    @Query('token') token?: string,
    @Query('phone') phone?: string,
  ) {
    return this.orderingService.trackOrder(code, token, phone);
  }

  @Get()
  async getOrders(@Query() query: GetOrdersDto) {
    return this.orderingService.getOrders(query);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Headers('x-user-role') changedBy?: string,
  ) {
    return this.orderingService.updateOrderStatus(
      id,
      dto.status,
      dto.reason,
      changedBy || 'STAFF',
    );
  }

  @Patch(':id/payment')
  async updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.orderingService.updatePaymentStatus(id, dto.paymentStatus);
  }

  @Post(':code/cancel')
  async cancelOrder(
    @Param('code') code: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderingService.cancelOrderByCustomer(code, dto.token, dto.reason);
  }
}
