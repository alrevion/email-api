import type { Context } from 'hono';

import { ApiError } from './auth';

/** Shared handler for root + nested Hono apps (delegated routers swallow parent onError). */
export function handleWorkerRouteError(err: unknown, c: Context): Response {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (err.retryAfterSeconds) headers['Retry-After'] = String(err.retryAfterSeconds);
    return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as any, headers);
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[email-api-worker]', err);
  if (msg.includes('PEPPER_MISSING')) {
    return c.json(
      {
        error: {
          code: 'misconfigured',
          message:
            'HMAC pepper is empty. Set Cloudflare secret API_KEY_PEPPER (wrangler secret put API_KEY_PEPPER). It must match the value used when service API keys were written to D1.',
        },
      },
      503
    );
  }
  return c.json({ error: { code: 'internal_error', message: 'Internal Server Error' } }, 500);
}
