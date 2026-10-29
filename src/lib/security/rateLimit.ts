/**
 * Sliding-window in-memory rate limiter with standard HTTP rate-limit headers.
 * Protects public and sensitive auth endpoints against brute-force attacks and abuse.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Run periodic cleanup every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [key, entry] of store.entries()) {
        entry.timestamps = entry.timestamps.filter((ts) => ts > now - 3600_000);
        if (entry.timestamps.length === 0) {
          store.delete(key);
        }
      }
    }
  }, 5 * 60_000).unref?.();
}

export interface RateLimitConfig {
  /** Maximum number of allowed requests within the window */
  limit: number;
  /** Window size in milliseconds (e.g., 15 * 60 * 1000 for 15 minutes) */
  windowMs: number;
  /** Unique namespace for this rate-limit tier (e.g. 'admin-auth', 'webhooks') */
  prefix?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds until next request permitted
}

/**
 * Extracts client IP from standard reverse-proxy headers (Cloudflare, Vercel, Nginx).
 */
export function getClientIp(req: Request | Headers): string {
  const headers = 'headers' in req ? (req.headers as Headers) : req;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();
  return '127.0.0.1';
}

/**
 * Checks whether an incoming request violates the sliding-window rate limit.
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { limit, windowMs, prefix = 'global' } = config;
  const now = Date.now();

  if (!stores.has(prefix)) {
    stores.set(prefix, new Map());
  }
  const store = stores.get(prefix)!;

  let entry = store.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Filter out timestamps outside the active sliding window
  const windowStart = now - windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length < limit) {
    entry.timestamps.push(now);
    const oldest = entry.timestamps[0] ?? now;
    const reset = Math.ceil((oldest + windowMs) / 1000);
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - entry.timestamps.length),
      reset,
      retryAfter: 0,
    };
  }

  // Rate limit exceeded
  const oldest = entry.timestamps[0] ?? now;
  const reset = Math.ceil((oldest + windowMs) / 1000);
  const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

  return {
    success: false,
    limit,
    remaining: 0,
    reset,
    retryAfter,
  };
}

/**
 * Formats standard RateLimit headers for Next.js NextResponse.
 */
export function createRateLimitHeaders(res: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(res.limit),
    'X-RateLimit-Remaining': String(res.remaining),
    'X-RateLimit-Reset': String(res.reset),
  };
  if (!res.success) {
    headers['Retry-After'] = String(res.retryAfter);
  }
  return headers;
}
