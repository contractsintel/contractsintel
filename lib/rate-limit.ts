// In-memory sliding-window rate limiter.
// Keyed by a caller identifier (user ID, org ID, IP, etc.).
// Suitable for single-instance deployments. For multi-instance,
// swap the Map for Redis.

type Entry = { timestamps: number[] };

const buckets = new Map<string, Entry>();

// Prune expired entries every 5 minutes to avoid memory leaks
const PRUNE_INTERVAL = 5 * 60 * 1000;
let lastPrune = Date.now();

function prune(windowMs: number) {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) buckets.delete(key);
  }
}

/**
 * Check if a request should be allowed.
 * @param key   Unique caller identifier (e.g. `ai:${userId}`)
 * @param limit Max requests allowed in the window
 * @param windowMs Window size in milliseconds (default: 60s)
 * @returns { allowed: boolean, remaining: number, retryAfterMs: number }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  prune(windowMs);

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  // Remove timestamps outside the window
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: oldest + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    retryAfterMs: 0,
  };
}
