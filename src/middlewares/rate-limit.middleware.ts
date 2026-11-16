import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { db } from '../config/db';

interface Hit {
  count: number;
  resetAt: number;
}

/**
 * Count one hit for `key` in the shared rate_limits table. Every serverless
 * instance sees the same counter, so a limit can't be dodged by landing on a
 * different instance. Atomic: one upsert per hit.
 */
const hitInDb = async (key: string, windowMs: number): Promise<Hit> => {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const rows = await db.execute<{ count: number; reset_at: Date | string }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + ${windowSeconds}::int * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
    RETURNING count, reset_at
  `);
  const row = rows[0];
  if (!row) throw new Error('rate limit upsert returned no row');

  // Now and then, drop counters that expired a while ago
  if (Math.random() < 0.01) {
    db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`).catch(() => {});
  }

  return { count: Number(row.count), resetAt: new Date(row.reset_at).getTime() };
};

// Used only if the database call fails (or the table isn't migrated yet), so
// logins keep working; it counts per instance, which is weaker but not nothing
const memory = new Map<string, Hit>();

const hitInMemory = (key: string, windowMs: number): Hit => {
  const now = Date.now();
  const record = memory.get(key);
  if (!record || record.resetAt <= now) {
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    const fresh = { count: 1, resetAt: now + windowMs };
    memory.set(key, fresh);
    return fresh;
  }
  record.count++;
  return record;
};

/**
 * Record a hit and throw 429 once `key` goes over `max` within `windowMs`.
 */
export const consumeRateLimit = async (
  c: Context,
  key: string,
  windowMs: number,
  max: number,
  message = 'Too many attempts',
) => {
  let hit: Hit;
  try {
    hit = await hitInDb(key, windowMs);
  } catch (err) {
    console.error('[rate-limit] database unavailable, counting in memory:', (err as Error).message);
    hit = hitInMemory(key, windowMs);
  }

  if (hit.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000));
    const minutes = Math.ceil(retryAfterSeconds / 60);
    c.header('Retry-After', String(retryAfterSeconds));
    throw new HTTPException(429, {
      message: `${message}. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }
};

/**
 * The caller's IP. On Vercel these headers are set by Vercel's edge, which
 * overwrites anything the client sent, so they can't be spoofed there.
 */
export const clientIp = (c: Context): string | undefined =>
  c.req.header('x-vercel-forwarded-for')?.split(',')[0].trim() ||
  c.req.header('x-real-ip') ||
  c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
  // Unknown IP: skip the IP limit rather than put every user in one bucket
  undefined;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  /** What to count by; defaults to the caller's IP. Return undefined to skip. */
  by?: (c: Context) => string | undefined | Promise<string | undefined>;
  message?: string;
}

/**
 * Apply several limits at once (e.g. per IP and per account). Their counters
 * are updated in parallel, so the request waits for one database round trip
 * instead of one per limit.
 */
export function rateLimits(...limits: RateLimitOptions[]): MiddlewareHandler {
  return async (c, next) => {
    await Promise.all(
      limits.map(async ({ windowMs, max, keyPrefix = 'rl', by, message }) => {
        const subject = by ? await by(c) : clientIp(c);
        if (subject) {
          await consumeRateLimit(c, `${keyPrefix}:${subject}`.slice(0, 255), windowMs, max, message);
        }
      }),
    );
    return next();
  };
}

export const rateLimiter = (options: RateLimitOptions): MiddlewareHandler => rateLimits(options);

/** Read a field from the JSON body (Hono caches the body, so handlers can read it again) */
export const bodyField =
  (field: string) =>
  async (c: Context): Promise<string | undefined> => {
    const body = await c.req.json().catch(() => null);
    const value = body?.[field];
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined;
  };
