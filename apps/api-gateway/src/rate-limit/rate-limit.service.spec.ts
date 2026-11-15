import { RateLimitService } from './rate-limit.service';
import { RedisService } from '@common/redis';

describe('RateLimitService', () => {
  const redis = { hitLimit: jest.fn() };
  let limiter: RateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    limiter = new RateLimitService(redis as unknown as RedisService);
  });

  it('blocks a login that exceeds its limit', async () => {
    redis.hitLimit.mockResolvedValue({ allowed: false, retryAfterMs: 12000 });
    expect(await limiter.check('POST', '/api/auth/login', '127.0.0.1')).toEqual(
      {
        allowed: false,
        retryAfterSeconds: 12,
      },
    );
    expect(redis.hitLimit).toHaveBeenCalledWith(
      expect.stringContaining('auth:login'),
      10,
      300,
    );
  });

  it('limits only the selected write routes', async () => {
    redis.hitLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    expect(
      await limiter.check('GET', '/api/catalog/products', '127.0.0.1'),
    ).toEqual({ allowed: true });
    expect(await limiter.check('POST', '/api/orders', '127.0.0.1')).toEqual({
      allowed: true,
    });
    expect(redis.hitLimit).toHaveBeenCalledTimes(1);
    expect(redis.hitLimit).toHaveBeenCalledWith(
      expect.stringContaining('orders:create'),
      10,
      60,
    );
  });

  it('fails open when Redis is unavailable', async () => {
    redis.hitLimit.mockRejectedValue(new Error('connection lost'));
    expect(
      await limiter.check('POST', '/api/auth/register', '127.0.0.1'),
    ).toEqual({ allowed: true });
  });

  it('rate limits GET /api/orders/track', async () => {
    redis.hitLimit.mockResolvedValue({ allowed: false, retryAfterMs: 5000 });
    const result = await limiter.check(
      'GET',
      '/api/orders/track?code=ORD-1',
      '127.0.0.1',
    );
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 5 });
    expect(redis.hitLimit).toHaveBeenCalledWith(
      expect.stringContaining('orders:track'),
      30,
      60,
    );
  });

  it('rate limits POST /api/catalog/upload', async () => {
    redis.hitLimit.mockResolvedValue({ allowed: false, retryAfterMs: 8000 });
    const result = await limiter.check(
      'POST',
      '/api/catalog/upload',
      '127.0.0.1',
    );
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 8 });
    expect(redis.hitLimit).toHaveBeenCalledWith(
      expect.stringContaining('catalog:upload'),
      20,
      300,
    );
  });
});
