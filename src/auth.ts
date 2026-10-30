import { Database, ServiceRow } from './db';
import { Config } from './config';
import { hashApiKey, secretEqual } from './crypto';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ServiceContext {
  id: string;
  name: string;
  role: 'service' | 'owner';
  api_key_prefix: string;
  allowed_types: string[];
  allowed_senders: string[];
  send_limit_per_hour: number;
}

function parseJsonArray(value: string | null | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : fallback;
  } catch {
    return fallback;
  }
}

function toContext(service: ServiceRow): ServiceContext {
  return {
    id: service.id,
    name: service.name,
    role: service.role === 'owner' ? 'owner' : 'service',
    api_key_prefix: service.api_key_prefix,
    allowed_types: parseJsonArray(service.allowed_types, ['otp', 'reset', 'verify']),
    allowed_senders: parseJsonArray(service.allowed_senders, ['noreply@alrevion.com']),
    send_limit_per_hour: service.send_limit_per_hour ?? 0,
  };
}

function extractBearer(authorization: string | null): string {
  if (!authorization) {
    throw new ApiError('unauthorized', 'Missing Authorization header', 401);
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError('unauthorized', 'Invalid Authorization header format', 401);
  }
  return match[1].trim();
}

/** Service auth — no valid key ⇒ 401, inactive ⇒ 403. Mirrors telegram-otp authenticateService. */
export async function authenticateService(
  authorization: string | null,
  db: Database,
  config: Config
): Promise<ServiceContext> {
  const apiKey = extractBearer(authorization);
  const apiKeyHash = await hashApiKey(apiKey, config.apiKeyPepper);
  const service = await db.getServiceByApiKeyHash(apiKeyHash);
  if (!service) {
    throw new ApiError('unauthorized', 'Invalid API key', 401);
  }
  if (!service.is_active) {
    throw new ApiError('service_disabled', 'Service is disabled', 403);
  }
  return toContext(service);
}

/** Owner-only auth (team@ + /reply). Same key store, but role must be 'owner'. */
export async function authenticateOwner(
  authorization: string | null,
  db: Database,
  config: Config
): Promise<ServiceContext> {
  const ctx = await authenticateService(authorization, db, config);
  if (ctx.role !== 'owner') {
    throw new ApiError('forbidden', 'Owner privileges required for team@ operations', 403);
  }
  return ctx;
}

/** Admin auth — guards /admin/* with ADMIN_API_SECRET (timing-safe compare). */
export async function authenticateAdmin(
  authorization: string | null,
  config: Config
): Promise<void> {
  if (!config.adminApiSecret) {
    throw new ApiError('admin_disabled', 'Admin API is not configured', 503);
  }
  const secret = extractBearer(authorization);
  const ok = await secretEqual(secret, config.adminApiSecret);
  if (!ok) {
    throw new ApiError('unauthorized', 'Invalid admin secret', 401);
  }
}
