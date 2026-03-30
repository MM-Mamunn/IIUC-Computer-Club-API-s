/**
 * Simple in-memory TTL cache for server-level caching.
 * No external dependencies (no Redis). Data lives in process memory.
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Return cached data if fresh, otherwise execute `fn`, cache, and return.
 * @param key   Unique cache key
 * @param ttlMs Time-to-live in milliseconds
 * @param fn    Async function that produces the data
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiry > Date.now()) return hit.data as T;

  const data = await fn();
  store.set(key, { data, expiry: Date.now() + ttlMs });
  return data;
}

/**
 * Invalidate cache entries whose key starts with `prefix`.
 * Call with no args to clear everything.
 */
export function invalidate(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
