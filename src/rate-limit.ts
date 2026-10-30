export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

/** KV sliding-window counter, ported from telegram-otp-api. */
export class RateLimiter {
  constructor(private kv: KVNamespace) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (limit <= 0) {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: 0 };
    }
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const counterKey = `ratelimit:${key}`;
    const data = (await this.kv.get(counterKey, 'json')) as
      | { count: number; windowStart: number }
      | null;

    let count = 0;
    let currentWindowStart = windowStart;
    if (data && data.windowStart > windowStart) {
      count = data.count;
      currentWindowStart = data.windowStart;
    }

    if (count >= limit) {
      const resetAt = currentWindowStart + windowSeconds * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(0, Math.ceil((resetAt - now) / 1000)),
      };
    }

    const newCount = count + 1;
    await this.kv.put(counterKey, JSON.stringify({ count: newCount, windowStart: currentWindowStart }), {
      expirationTtl: Math.max(60, windowSeconds),
    });
    return { allowed: true, remaining: limit - newCount, resetAt: currentWindowStart + windowSeconds * 1000 };
  }
}
