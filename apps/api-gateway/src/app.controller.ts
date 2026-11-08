import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from '@common/redis';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/redis')
  getRedisHealth(): { redis: 'ready' | 'degraded' } {
    return { redis: this.redis.isReady() ? 'ready' : 'degraded' };
  }
}
