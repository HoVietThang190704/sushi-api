import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient } from 'redis';

const LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count <= tonumber(ARGV[1]) and 1 or 0, ttl}
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: (retries) => Math.min(retries * 1000, 10000),
    },
  });
  private lastWarning = 0;

  constructor() {
    this.client.on('error', (error: unknown) => {
      const errorMsg =
        error instanceof Error
          ? error.message || error.name
          : String(error) || 'Unknown connection error';
      this.warn(`Connection error: ${errorMsg}`);
    });
    this.client.on('ready', () => this.logger.log('Redis connection ready'));
  }

  onModuleInit(): void {
    // Connection retries in the background. Never block HTTP startup on a cache outage.
    void this.client.connect().catch((error: unknown) => {
      const errorMsg =
        error instanceof Error
          ? error.message || error.name
          : String(error) || 'Unknown connection error';
      this.warn(`Connection failed: ${errorMsg}`);
    });
  }

  isReady(): boolean {
    return this.client.isReady;
  }

  private warn(message: string): void {
    if (Date.now() - this.lastWarning >= 30000 || !this.lastWarning) {
      this.logger.warn(
        `Redis degraded (cache bypassed; rate limiting fail-open): ${message}`,
      );
      this.lastWarning = Date.now();
    }
  }

  private async run<T>(operation: () => Promise<T>): Promise<T | null> {
    if (!this.client.isReady) {
      this.warn('Redis is not ready');
      return null;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis command timed out')),
            500,
          );
        }),
      ]);
    } catch (error) {
      this.warn(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  get(key: string): Promise<string | null> {
    return this.run(() => this.client.get(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (
      (await this.run(() =>
        this.client.set(key, value, { EX: ttlSeconds }),
      )) === 'OK'
    );
  }

  increment(key: string): Promise<number | null> {
    return this.run(() => this.client.incr(key));
  }

  async hitLimit(
    key: string,
    limit: number,
    seconds: number,
  ): Promise<{ allowed: boolean; retryAfterMs: number } | null> {
    const result = await this.run(() =>
      this.client.eval(LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(limit), String(seconds)],
      }),
    );
    if (!Array.isArray(result)) return null;
    return {
      allowed: Number(result[0]) === 1,
      retryAfterMs: Number(result[1]),
    };
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
