import { createRateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';
import type { Request, Response, NextFunction } from 'express';

describe('createRateLimitMiddleware', () => {
  it('returns 429 with retry-after before proxying a limited request', async () => {
    const limiter = {
      check: jest
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterSeconds: 12 }),
    };
    const req = {
      method: 'POST',
      path: '/api/auth/login',
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '10.10.10.10' },
    } as unknown as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const next = jest.fn() as NextFunction;

    await createRateLimitMiddleware(limiter as unknown as RateLimitService)(
      req,
      { status, setHeader } as unknown as Response,
      next,
    );

    expect(limiter.check).toHaveBeenCalledWith(
      'POST',
      '/api/auth/login',
      '127.0.0.1',
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});
