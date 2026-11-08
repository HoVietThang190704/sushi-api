import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from '@common/redis';
import { RateLimitService } from './rate-limit/rate-limit.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    RealtimeModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService, RateLimitService],
})
export class AppModule {}
