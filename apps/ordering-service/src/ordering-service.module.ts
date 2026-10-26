import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OrderingService } from './ordering.service';
import { OrderingController } from './ordering.controller';
import { RabbitMQModule } from '@common/rabbitmq';

@Module({
  imports: [RabbitMQModule],
  controllers: [OrderingController],
  providers: [PrismaService, OrderingService],
  exports: [PrismaService, OrderingService],
})
export class OrderingServiceModule {}
