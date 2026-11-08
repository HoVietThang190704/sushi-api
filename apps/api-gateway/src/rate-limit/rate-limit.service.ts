import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@common/redis';

const RULES: Record<string, { label: string; limit: number; seconds: number }> =
  {
    '/api/auth/login': { label: 'auth:login', limit: 10, seconds: 300 },
    '/api/auth/register': { label: 'auth:register', limit: 5, seconds: 3600 },
    '/api/auth/refresh': { label: 'auth:refresh', limit: 30, seconds: 300 },
    '/api/orders': { label: 'orders:create', limit: 10, seconds: 60 },
  };

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  constructor(private readonly redis: RedisService) {}

  async check(
    method: string,
    path: string,
    ip: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const rule =
      method.toUpperCase() === 'POST'
        ? RULES[path.replace(/\/$/, '')]
        : undefined;
    if (!rule) return { allowed: true };

    let result: Awaited<ReturnType<RedisService['hitLimit']>>;
    try {
      result = await this.redis.hitLimit(
        `rate:${rule.label}:${ip}`,
        rule.limit,
        rule.seconds,
      );
    } catch (error) {
      this.logger.warn(
        `Rate limiter unavailable; allowing request: ${String(error)}`,
      );
      return { allowed: true };
    }
    if (!result || result.allowed) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
    };
  }
}
