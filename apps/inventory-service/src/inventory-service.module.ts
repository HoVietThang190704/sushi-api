import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { RabbitMQModule, RabbitMQService } from '@common/rabbitmq';
import { AuthModule, OutboxDispatcherService } from '@common';

@Module({
  imports: [AuthModule, RabbitMQModule],
  controllers: [InventoryController],
  providers: [
    PrismaService,
    InventoryService,
    {
      provide: OutboxDispatcherService,
      useFactory: (prisma: PrismaService, rabbitmq: RabbitMQService) =>
        new OutboxDispatcherService(prisma, rabbitmq, {
          workerId: `inventory-outbox-${process.pid}`,
        }),
      inject: [PrismaService, RabbitMQService],
    },
  ],
  exports: [PrismaService, InventoryService, OutboxDispatcherService],
})
export class InventoryServiceModule {}
