import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

interface RateLimitStore {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitStore>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, store] of rateLimitMap.entries()) {
    if (store.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}): MiddlewareHandler {
  const { windowMs, max, keyPrefix = 'rl' } = options;

  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown-ip';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record || record.resetAt <= now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      throw new HTTPException(429, {
        message: `Too many submission attempts. Please try again after ${retryAfterSeconds} seconds.`,
      });
    }

    record.count++;
    return next();
  };
}
