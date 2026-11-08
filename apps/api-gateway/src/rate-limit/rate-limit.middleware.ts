import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service';

export function createRateLimitMiddleware(limiter: RateLimitService) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = await limiter.check(
      req.method,
      req.path,
      req.ip || req.socket.remoteAddress || 'unknown',
    );
    if (result.allowed) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({ statusCode: 429, message: 'Too many requests' });
  };
}
