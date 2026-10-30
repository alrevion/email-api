import { describe, expect, it } from 'vitest';

import { Config } from '../src/config';
import { createAdminRoutes } from '../src/routes/admin';
import type { Database, ServiceRow } from '../src/db';

const ADMIN_SECRET = 'test-admin-secret';
const authHeader = { Authorization: `Bearer ${ADMIN_SECRET}` } as const;

function makeConfig() {
  return new Config({
    API_KEY_PEPPER: 'p',
    ADMIN_API_SECRET: ADMIN_SECRET,
    TEAM_ADDRESS: 'team@alrevion.com',
  } as any);
}

/** Fake Database — createService just needs to look like it succeeded. */
function makeDb(): Database {
  const db = {
    createService: async (): Promise<ServiceRow> => ({
      id: 'svc1',
      name: 'x',
      api_key_hash: 'h',
      api_key_prefix: 'alr_test',
      role: 'service',
      allowed_types: '["otp"]',
      allowed_senders: '["noreply@alrevion.com"]',
      send_limit_per_hour: 0,
      is_active: 1,
      created_at: '',
      updated_at: '',
    }),
    createAuditLog: async () => {},
  };
  return db as unknown as Database;
}

describe('POST /admin/services — team@ guard (AUDIT.md P2)', () => {
  it('rejects team@ in a non-owner service allowed_senders', async () => {
    const app = createAdminRoutes(makeDb(), makeConfig());
    const res = await app.request('/admin/services', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'svc', allowed_senders: ['noreply@alrevion.com', 'team@alrevion.com'] }),
    });
    expect(res.status).toBe(400);
  });

  it('allows team@ when role is owner', async () => {
    const app = createAdminRoutes(makeDb(), makeConfig());
    const res = await app.request('/admin/services', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'svc', role: 'owner', allowed_senders: ['noreply@alrevion.com', 'team@alrevion.com'] }),
    });
    expect(res.status).toBe(200);
  });

  it('allows a non-owner service without team@', async () => {
    const app = createAdminRoutes(makeDb(), makeConfig());
    const res = await app.request('/admin/services', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'svc', allowed_senders: ['noreply@alrevion.com'] }),
    });
    expect(res.status).toBe(200);
  });
});
