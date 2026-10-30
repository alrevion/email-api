// Login lockout via the Cloudflare Cache API (caches.default).
// No KV / no D1: per-colo, free/unlimited, approximate (cache is per-datacenter and may be
// evicted early — acceptable for a brute-force speed bump). Entries auto-expire via Cache-Control.

const BASE = 'https://lockout.email-api.internal/';
const MAX_ATTEMPTS = 2; // after this many failures the IP is blocked
const BLOCK_SECONDS = 24 * 3600; // 24h
const WINDOW_SECONDS = 24 * 3600; // how long failed attempts are remembered

function keyFor(kind: 'fail' | 'block', ip: string): Request {
  return new Request(`${BASE}${kind}/${encodeURIComponent(ip)}`);
}

function marker(value: string, ttl: number): Response {
  return new Response(value, {
    headers: { 'Cache-Control': `max-age=${ttl}`, 'Content-Type': 'text/plain' },
  });
}

/** Returns remaining block seconds (>0 if currently blocked), else 0. */
export async function isBlocked(ip: string): Promise<number> {
  const r = await caches.default.match(keyFor('block', ip));
  if (!r) return 0;
  const until = parseInt(await r.text(), 10);
  const now = Math.floor(Date.now() / 1000);
  return Number.isFinite(until) && until > now ? until - now : 0;
}

/** Record a failed attempt; blocks the IP for 24h once MAX_ATTEMPTS is reached. */
export async function registerFailure(ip: string): Promise<{ blocked: boolean; retryAfter: number }> {
  const cache = caches.default;
  const failKey = keyFor('fail', ip);
  const prev = await cache.match(failKey);
  const count = prev ? parseInt(await prev.text(), 10) || 0 : 0;
  const next = count + 1;

  if (next >= MAX_ATTEMPTS) {
    const until = Math.floor(Date.now() / 1000) + BLOCK_SECONDS;
    await cache.put(keyFor('block', ip), marker(String(until), BLOCK_SECONDS));
    await cache.delete(failKey);
    return { blocked: true, retryAfter: BLOCK_SECONDS };
  }
  await cache.put(failKey, marker(String(next), WINDOW_SECONDS));
  return { blocked: false, retryAfter: 0 };
}

/** Clear failure counter + block for an IP (called on successful login, or admin unlock). */
export async function clearLockout(ip: string): Promise<void> {
  const cache = caches.default;
  await cache.delete(keyFor('fail', ip));
  await cache.delete(keyFor('block', ip));
}
