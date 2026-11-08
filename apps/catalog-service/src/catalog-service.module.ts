import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CatalogServiceController } from './catalog-service.controller';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { RolesGuard } from './guards/roles.guard';
import { CloudinaryService } from '@common';
import { RabbitMQModule } from '@common/rabbitmq';
import { RedisModule } from '@common/redis';
import { CatalogCacheService } from './catalog-cache.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    JwtModule.register({}),
    RabbitMQModule,
    RedisModule,
  ],
  controllers: [CatalogServiceController],
  providers: [
    CatalogServiceService,
    PrismaService,
    RolesGuard,
    CloudinaryService,
    CatalogCacheService,
  ],
  exports: [
    CatalogServiceService,
    PrismaService,
    RolesGuard,
    CloudinaryService,
  ],
})
export class CatalogServiceModule {}
