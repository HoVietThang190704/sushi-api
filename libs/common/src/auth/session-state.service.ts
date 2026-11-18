import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Slightly longer than the 15m access-token lifetime. */
const STATE_TTL_SECONDS = 20 * 60;

/**
 * Tracks the minimum valid token version per user in Redis so that
 * access tokens issued before a ban / role change / password reset are
 * rejected immediately instead of living out their 15 minute lifetime.
 *
 * Fails open when Redis is unavailable (token expiry still bounds it).
 */
@Injectable()
export class SessionStateService {
  constructor(private readonly redis: RedisService) {}

  private key(userId: string): string {
    return `auth:min-tv:${userId}`;
  }

  /** Publish the user's current token version after it was bumped. */
  async publish(userId: string, tokenVersion: number): Promise<void> {
    await this.redis.set(
      this.key(userId),
      String(tokenVersion),
      STATE_TTL_SECONDS,
    );
  }

  /** True when the presented token predates the latest revocation. */
  async isStale(userId: string, tokenVersion: number): Promise<boolean> {
    const raw = await this.redis.get(this.key(userId));
    if (raw === null) return false;
    const min = Number(raw);
    return Number.isFinite(min) && tokenVersion < min;
  }
}
