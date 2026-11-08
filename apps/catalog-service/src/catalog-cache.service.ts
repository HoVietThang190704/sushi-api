import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@common/redis';

@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);
  constructor(private readonly redis: RedisService) {}

  async remember<T>(
    namespace: 'categories' | 'products',
    identity: string,
    load: () => Promise<T>,
  ): Promise<T> {
    let version: string | null;
    try {
      version = await this.redis.get(`catalog:version:${namespace}`);
    } catch (error) {
      this.logger.warn(`Redis cache unavailable: ${String(error)}`);
      return load();
    }
    if (version === null && !this.redis.isReady()) return load();

    const key = `catalog:${namespace}:${version ?? '0'}:${identity}`;
    const cached = await this.redis.get(key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Replace a malformed cache entry from PostgreSQL.
      }
    }
    const result = await load();
    // A write may have invalidated the version while the database read was in flight.
    if ((await this.redis.get(`catalog:version:${namespace}`)) === version) {
      await this.redis.set(key, JSON.stringify(result), 60);
    }
    return result;
  }

  async invalidateCategories(): Promise<void> {
    await this.redis.increment('catalog:version:categories');
  }

  async invalidateProducts(): Promise<void> {
    await this.redis.increment('catalog:version:products');
  }
}
