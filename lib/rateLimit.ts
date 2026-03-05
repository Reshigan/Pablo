/**
 * ARCH-01: In-memory rate limiting for API routes.
 *
 * Uses a sliding window counter per IP address.
 * In production on Cloudflare Workers, each isolate has its own Map so this
 * provides per-isolate limiting (sufficient for burst protection).
 * For distributed rate limiting, migrate to Cloudflare KV or Durable Objects.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (typically IP address or user ID).
 * Returns whether the request is allowed and rate limit metadata.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: now + windowMs,
    };
  }

  entry.count++;
  const remaining = Math.max(0, config.limit - entry.count);

  if (entry.count > config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    limit: config.limit,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Pre-configured rate limit configs for different API tiers.
 */
export const RATE_LIMITS = {
  /** Chat/LLM endpoints: 30 requests per minute */
  chat: { limit: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** General API endpoints: 120 requests per minute */
  api: { limit: 120, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Auth endpoints: 10 requests per minute (brute force protection) */
  auth: { limit: 10, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Deploy endpoints: 5 requests per minute */
  deploy: { limit: 5, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;

/**
 * Extract client IP from request headers.
 * Works with Cloudflare (CF-Connecting-IP) and standard proxies (X-Forwarded-For).
 */
export function getClientIP(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Build rate limit response headers.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
