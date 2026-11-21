import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OrderingService } from './ordering.service';
import { OrderingController } from './ordering.controller';
import { ShippingService } from './shipping/shipping.service';
import { ShippingController } from './shipping/shipping.controller';
import { VietnamAddressService } from './shipping/vietnam-address.service';
import { RabbitMQModule, RabbitMQService } from '@common/rabbitmq';
import { AuthModule, OutboxDispatcherService } from '@common';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  imports: [AuthModule, RabbitMQModule],
  controllers: [ReportsController, OrderingController, ShippingController],
  providers: [
    PrismaService,
    OrderingService,
    ReportsService,
    ShippingService,
    VietnamAddressService,
    {
      provide: OutboxDispatcherService,
      useFactory: (prisma: PrismaService, rabbitmq: RabbitMQService) =>
        new OutboxDispatcherService(prisma, rabbitmq, {
          workerId: `ordering-outbox-${process.pid}`,
        }),
      inject: [PrismaService, RabbitMQService],
    },
  ],
  exports: [
    PrismaService,
    OrderingService,
    ShippingService,
    VietnamAddressService,
    OutboxDispatcherService,
  ],
})
export class OrderingServiceModule {}
