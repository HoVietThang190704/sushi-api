import { CatalogCacheService } from './catalog-cache.service';
import { RedisService } from '@common/redis';

describe('CatalogCacheService', () => {
  const store = new Map<string, string>();
  const redis = {
    isReady: jest.fn(() => true),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return true;
    }),
    increment: jest.fn(async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    }),
  };
  let cache: CatalogCacheService;

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    cache = new CatalogCacheService(redis as unknown as RedisService);
  });

  it('loads from the database once for a cache hit and preserves product data', async () => {
    const load = jest
      .fn()
      .mockResolvedValue([{ id: 'p1', sellingPrice: '120000' }]);
    expect(await cache.remember('products', 'all', load)).toEqual([
      { id: 'p1', sellingPrice: '120000' },
    ]);
    expect(await cache.remember('products', 'all', load)).toEqual([
      { id: 'p1', sellingPrice: '120000' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60,
    );
  });

  it('separates category-filtered product lists', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(['maki'])
      .mockResolvedValueOnce(['nigiri']);
    expect(await cache.remember('products', 'category:a', load)).toEqual([
      'maki',
    ]);
    expect(await cache.remember('products', 'category:b', load)).toEqual([
      'nigiri',
    ]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidates all product list variants without scanning keys', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(['old'])
      .mockResolvedValueOnce(['new']);
    await cache.remember('products', 'category:a', load);
    await cache.invalidateProducts();
    expect(await cache.remember('products', 'category:a', load)).toEqual([
      'new',
    ]);
  });

  it('reads from the database when Redis is unavailable', async () => {
    redis.get.mockRejectedValueOnce(new Error('connection lost'));
    const load = jest.fn().mockResolvedValue(['db']);
    expect(await cache.remember('products', 'all', load)).toEqual(['db']);
    expect(redis.set).not.toHaveBeenCalled();
  });
});
