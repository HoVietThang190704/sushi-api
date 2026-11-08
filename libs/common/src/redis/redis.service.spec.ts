import { RedisService } from './redis.service';
import { createClient } from 'redis';

describe('RedisService', () => {
  it('returns unavailable without queueing a command while disconnected', async () => {
    const service = new RedisService();
    expect(await service.get('menu')).toBeNull();
    expect(await service.hitLimit('rate:key', 2, 60)).toBeNull();
  });

  it('fails open promptly when a Redis command hangs', async () => {
    jest.useFakeTimers();
    try {
      const service = new RedisService();
      const client = (
        service as unknown as { client: ReturnType<typeof createClient> }
      ).client;
      jest.spyOn(client, 'isReady', 'get').mockReturnValue(true);
      jest
        .spyOn(client, 'eval')
        .mockImplementation(() => new Promise(() => {}));

      const decision = service.hitLimit('rate:login:ip', 10, 300);
      await jest.advanceTimersByTimeAsync(501);
      expect(await decision).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
