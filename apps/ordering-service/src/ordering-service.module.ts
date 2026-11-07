import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { OrderingService } from './ordering.service';
import { OrderingController } from './ordering.controller';
import { ShippingService } from './shipping/shipping.service';
import { ShippingController } from './shipping/shipping.controller';
import { RabbitMQModule } from '@common/rabbitmq';

@Module({
  imports: [JwtModule.register({}), RabbitMQModule],
  controllers: [OrderingController, ShippingController],
  providers: [PrismaService, OrderingService, ShippingService],
  exports: [PrismaService, OrderingService, ShippingService],
})
export class OrderingServiceModule {}
