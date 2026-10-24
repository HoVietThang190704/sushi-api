import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { RabbitMQModule } from '@common/rabbitmq';

@Module({
  imports: [RabbitMQModule],
  controllers: [InventoryController],
  providers: [PrismaService, InventoryService],
  exports: [PrismaService, InventoryService],
})
export class InventoryServiceModule {}
