import { afterEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../src/config';
import { createSendRoutes } from '../src/routes/send';
import { hashApiKey } from '../src/crypto';
import type { Database, ServiceRow } from '../src/db';

const PEPPER = 'test-pepper';
const API_KEY = 'alr_testkey';
const authHeader = { Authorization: `Bearer ${API_KEY}` } as const;

// KV stub good enough for RateLimiter (get→null always "under limit", put is a no-op).
const fakeKV = { get: async () => null, put: async () => {} } as unknown as KVNamespace;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return new Config({
    RATE_LIMIT: fakeKV,
    API_KEY_PEPPER: PEPPER,
    BREVO_API_KEY: 'brevo-key',
    RESEND_API_KEY: 'resend-key',
    NOREPLY_ADDRESS: 'noreply@alrevion.com',
    VERIFY_URL_ALLOWED_ORIGINS: 'https://auth.alrevion.com',
    ...overrides,
  } as any);
}

/** Fake Database exposing only what send.ts touches; records every recordSend() call. */
async function makeDb(serviceOverrides: Partial<ServiceRow> = {}) {
  const apiKeyHash = await hashApiKey(API_KEY, PEPPER);
  const service: ServiceRow = {
    id: 'svc1',
    name: 'Test service',
    api_key_hash: apiKeyHash,
    api_key_prefix: 'alr_test',
    role: 'service',
    allowed_types: JSON.stringify(['otp', 'reset', 'verify', 'custom']),
    allowed_senders: JSON.stringify(['noreply@alrevion.com']),
    send_limit_per_hour: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ...serviceOverrides,
  };
  const recorded: Array<Record<string, unknown>> = [];
  const db = {
    getServiceByApiKeyHash: async (h: string) => (h === apiKeyHash ? service : null),
    recordSend: async (input: Record<string, unknown>) => {
      recorded.push(input);
    },
    pruneOldSends: async () => {},
  };
  return { db: db as unknown as Database, recorded };
}

function mockFetchOk() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ messageId: 'b1' }), { status: 201 })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /send — B2 template-only enforcement for non-custom types', () => {
  it('rejects raw subject/html for type "otp" (raw_content_not_allowed)', async () => {
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'otp', to: 'u@x.com', subject: 'hi', html: '<b>hi</b>' }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as any;
    expect(j.error.code).toBe('raw_content_not_allowed');
  });

  it('rejects a template name that does not match type', async () => {
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'otp', to: 'u@x.com', template: 'reset', vars: { code: '123456' } }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(400);
  });

  it('sends via template when template matches type, and does not store the body (B3)', async () => {
    mockFetchOk();
    const { db, recorded } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'otp', to: 'u@x.com', template: 'otp', vars: { code: '123456' } }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(200);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].body).toBeNull();
  });

  it('ignores a client-supplied vars.app_name and uses the configured app name', async () => {
    let sentSubject = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      sentSubject = JSON.parse(init.body).subject;
      return new Response(JSON.stringify({ messageId: 'b1' }), { status: 201 });
    });
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig({ APP_NAME: 'Alrevion' }));
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'otp', to: 'u@x.com', template: 'otp', vars: { code: '1', app_name: 'EvilCorp' } }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(200);
    expect(sentSubject).toContain('Alrevion');
    expect(sentSubject).not.toContain('EvilCorp');
  });

  it('still allows raw html/subject for type "custom" and keeps its body', async () => {
    mockFetchOk();
    const { db, recorded } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'custom', to: 'u@x.com', subject: 'hi', html: '<b>hi</b>' }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(200);
    expect(recorded[0].body).toBe('<b>hi</b>');
  });
});

describe('POST /send — B2 verify_url allowlist', () => {
  it('rejects a non-https verify_url', async () => {
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'verify',
          to: 'u@x.com',
          template: 'verify',
          vars: { verify_url: 'http://auth.alrevion.com/confirm' },
        }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(400);
  });

  it('rejects an https verify_url whose origin is not allowlisted', async () => {
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'verify',
          to: 'u@x.com',
          template: 'verify',
          vars: { verify_url: 'https://evil.example/confirm' },
        }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(400);
  });

  it('accepts an allowlisted https verify_url', async () => {
    mockFetchOk();
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'verify',
          to: 'u@x.com',
          template: 'verify',
          vars: { verify_url: 'https://auth.alrevion.com/confirm?t=abc' },
        }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /send — B4 header sanitization', () => {
  it('strips CR/LF and mailbox-syntax chars from from_name, and CR/LF from subject', async () => {
    let sentName = '';
    let sentSubject = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      const payload = JSON.parse(init.body);
      sentName = payload.sender?.name ?? '';
      sentSubject = payload.subject ?? '';
      return new Response(JSON.stringify({ messageId: 'b1' }), { status: 201 });
    });
    const { db } = await makeDb();
    const app = createSendRoutes(db, makeConfig());
    const res = await app.request(
      '/send',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          to: 'u@x.com',
          from_name: 'Evil\r\nBcc: hacked@evil.com <a@b.com>,"x"',
          subject: 'Hi\r\nBcc: hacked@evil.com',
          html: '<b>hi</b>',
        }),
      },
      { RATE_LIMIT: fakeKV }
    );
    expect(res.status).toBe(200);
    expect(sentName).not.toMatch(/[\r\n<>",;@]/);
    expect(sentSubject).not.toMatch(/[\r\n]/);
  });
});
