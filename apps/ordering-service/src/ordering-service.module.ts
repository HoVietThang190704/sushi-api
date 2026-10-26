import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RabbitMQModule } from '@common/rabbitmq';

@Module({
  imports: [RabbitMQModule],
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class OrderingServiceModule {}
