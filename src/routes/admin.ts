import { Hono } from 'hono';
import type { Context } from 'hono';

import { Config, Env } from '../config';
import { Database } from '../db';
import { ApiError, authenticateAdmin } from '../auth';
import { handleWorkerRouteError } from '../hono-errors';
import { generateApiKey, generateApiKeyPrefix, hashApiKey } from '../crypto';
import { clearLockout } from '../dashboard/lockout';

interface CreateServiceBody {
  name?: string;
  role?: 'service' | 'owner';
  allowed_types?: string[];
  allowed_senders?: string[];
  send_limit_per_hour?: number;
}

interface UpdateServiceBody {
  is_active?: boolean;
  allowed_types?: string[];
  role?: 'service' | 'owner';
  send_limit_per_hour?: number;
}

/** Admin-gated service/key management (ADMIN_API_SECRET). Raw key returned only once. */
export function createAdminRoutes(db: Database, config: Config) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleWorkerRouteError);

  app.post('/admin/services', async (c: Context) => {
    await authenticateAdmin(c.req.header('authorization') || null, config);
    const body = (await c.req.json().catch(() => null)) as CreateServiceBody | null;
    if (!body?.name?.trim()) throw new ApiError('invalid_request', '"name" is required', 400);

    const role = body.role === 'owner' ? 'owner' : 'service';
    if (role !== 'owner' && body.allowed_senders?.some((s) => s.trim().toLowerCase() === config.teamAddress.toLowerCase())) {
      throw new ApiError('invalid_request', `"${config.teamAddress}" may only be assigned to an owner-role service`, 400);
    }

    const apiKey = generateApiKey();
    const service = await db.createService({
      name: body.name.trim(),
      api_key_hash: await hashApiKey(apiKey, config.apiKeyPepper),
      api_key_prefix: generateApiKeyPrefix(apiKey),
      role: body.role,
      allowed_types: body.allowed_types,
      allowed_senders: body.allowed_senders,
      send_limit_per_hour: body.send_limit_per_hour,
    });
    await db.createAuditLog({ service_id: service.id, action: 'service_created', meta: { role: service.role } });

    return c.json({
      id: service.id,
      name: service.name,
      api_key: apiKey, // shown once
      api_key_prefix: service.api_key_prefix,
      role: service.role,
      allowed_types: JSON.parse(service.allowed_types),
      allowed_senders: JSON.parse(service.allowed_senders),
      send_limit_per_hour: service.send_limit_per_hour,
      is_active: !!service.is_active,
      created_at: service.created_at,
    });
  });

  app.post('/admin/services/:id/rotate-key', async (c: Context) => {
    await authenticateAdmin(c.req.header('authorization') || null, config);
    const id = c.req.param('id')!;
    const service = await db.getServiceById(id);
    if (!service) throw new ApiError('service_not_found', 'Service not found', 404);

    const newApiKey = generateApiKey();
    await db.rotateServiceApiKey(id, await hashApiKey(newApiKey, config.apiKeyPepper), generateApiKeyPrefix(newApiKey));
    await db.createAuditLog({ service_id: id, action: 'key_rotated' });
    return c.json({ id, api_key: newApiKey, api_key_prefix: generateApiKeyPrefix(newApiKey) });
  });

  app.patch('/admin/services/:id', async (c: Context) => {
    await authenticateAdmin(c.req.header('authorization') || null, config);
    const id = c.req.param('id')!;
    const service = await db.getServiceById(id);
    if (!service) throw new ApiError('service_not_found', 'Service not found', 404);

    const body = (await c.req.json().catch(() => ({}))) as UpdateServiceBody;
    await db.updateService(id, {
      is_active: body.is_active,
      allowed_types: body.allowed_types,
      role: body.role,
      send_limit_per_hour: body.send_limit_per_hour,
    });
    await db.createAuditLog({ service_id: id, action: 'service_updated', meta: body });
    return c.json({ ok: true });
  });

  // Clear a dashboard IP lockout (recover from a self-lockout). Cache-API lockout is per-IP.
  app.post('/admin/dashboard/unblock', async (c: Context) => {
    await authenticateAdmin(c.req.header('authorization') || null, config);
    const body = (await c.req.json().catch(() => ({}))) as { ip?: string };
    const ip = body.ip?.trim();
    if (!ip) throw new ApiError('invalid_request', '"ip" is required', 400);
    await clearLockout(ip);
    return c.json({ ok: true });
  });

  app.get('/admin/services/:id', async (c: Context) => {
    await authenticateAdmin(c.req.header('authorization') || null, config);
    const service = await db.getServiceById(c.req.param('id')!);
    if (!service) throw new ApiError('service_not_found', 'Service not found', 404);
    return c.json({
      id: service.id,
      name: service.name,
      api_key_prefix: service.api_key_prefix,
      role: service.role,
      allowed_types: JSON.parse(service.allowed_types),
      allowed_senders: JSON.parse(service.allowed_senders),
      send_limit_per_hour: service.send_limit_per_hour,
      is_active: !!service.is_active,
      created_at: service.created_at,
      updated_at: service.updated_at,
    });
  });

  return app;
}
