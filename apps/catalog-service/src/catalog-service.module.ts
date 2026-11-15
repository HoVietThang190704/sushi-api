import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CatalogServiceController } from './catalog-service.controller';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { CloudinaryService, AuthModule } from '@common';
import { RabbitMQModule } from '@common/rabbitmq';
import { RedisModule } from '@common/redis';
import { CatalogCacheService } from './catalog-cache.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    AuthModule,
    RabbitMQModule,
    RedisModule,
  ],
  controllers: [CatalogServiceController],
  providers: [
    CatalogServiceService,
    PrismaService,
    CloudinaryService,
    CatalogCacheService,
  ],
  exports: [CatalogServiceService, PrismaService, CloudinaryService],
})
export class CatalogServiceModule {}
