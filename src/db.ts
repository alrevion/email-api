import { generateUUID } from './crypto';

export interface ServiceRow {
  id: string;
  name: string;
  api_key_hash: string;
  api_key_prefix: string;
  role: string;
  allowed_types: string;
  allowed_senders: string;
  send_limit_per_hour: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceInput {
  name: string;
  api_key_hash: string;
  api_key_prefix: string;
  role?: 'service' | 'owner';
  allowed_types?: string[];
  allowed_senders?: string[];
  send_limit_per_hour?: number;
}

export interface RecordSendInput {
  service_id: string | null;
  type: string;
  sender: string;
  recipient: string;
  subject?: string;
  body?: string | null;
  provider?: string;
  provider_message_id?: string;
  status: 'sent' | 'failed';
  fallback_used?: boolean;
  error?: string;
  in_reply_to?: string;
  thread_id?: string;
  attachments?: string;
  /** Pre-generated row id (e.g. when attachments were already stored under it). */
  id?: string;
}

export interface InboundInput {
  message_id?: string;
  from_addr: string;
  to_addr: string;
  subject?: string;
  in_reply_to?: string;
  refs?: string;
  snippet?: string;
  raw_size?: number;
}

export interface InboundRow {
  id: string;
  message_id: string | null;
  from_addr: string;
  to_addr: string;
  subject: string | null;
  in_reply_to: string | null;
  refs: string | null;
  snippet: string | null;
  raw_size: number | null;
  received_at: string;
  replied_at: string | null;
  thread_id: string | null;
}

export class Database {
  constructor(private db: D1Database) {}

  // ---- services / keys ----

  async getServiceByApiKeyHash(hash: string): Promise<ServiceRow | null> {
    return this.db
      .prepare('SELECT * FROM services WHERE api_key_hash = ?')
      .bind(hash)
      .first<ServiceRow>();
  }

  async getServiceById(id: string): Promise<ServiceRow | null> {
    return this.db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first<ServiceRow>();
  }

  async createService(input: CreateServiceInput): Promise<ServiceRow> {
    const id = generateUUID();
    const role = input.role === 'owner' ? 'owner' : 'service';
    const allowedTypes = JSON.stringify(input.allowed_types ?? ['otp', 'reset', 'verify']);
    const defaultSenders =
      role === 'owner'
        ? ['noreply@alrevion.com', 'team@alrevion.com']
        : ['noreply@alrevion.com'];
    const allowedSenders = JSON.stringify(input.allowed_senders ?? defaultSenders);
    const sendLimit = input.send_limit_per_hour ?? 0;

    await this.db
      .prepare(
        `INSERT INTO services (id, name, api_key_hash, api_key_prefix, role, allowed_types, allowed_senders, send_limit_per_hour)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.name,
        input.api_key_hash,
        input.api_key_prefix,
        role,
        allowedTypes,
        allowedSenders,
        sendLimit
      )
      .run();

    const created = await this.getServiceById(id);
    if (!created) throw new Error('Failed to create service');
    return created;
  }

  async rotateServiceApiKey(id: string, newHash: string, newPrefix: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE services SET api_key_hash = ?, api_key_prefix = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(newHash, newPrefix, id)
      .run();
  }

  async updateService(
    id: string,
    fields: { is_active?: boolean; allowed_types?: string[]; role?: 'service' | 'owner'; send_limit_per_hour?: number }
  ): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (fields.is_active !== undefined) {
      sets.push('is_active = ?');
      vals.push(fields.is_active ? 1 : 0);
    }
    if (fields.allowed_types !== undefined) {
      sets.push('allowed_types = ?');
      vals.push(JSON.stringify(fields.allowed_types));
    }
    if (fields.role !== undefined) {
      sets.push('role = ?');
      vals.push(fields.role);
    }
    if (fields.send_limit_per_hour !== undefined) {
      sets.push('send_limit_per_hour = ?');
      vals.push(fields.send_limit_per_hour);
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    vals.push(id);
    await this.db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  }

  // ---- send log ----

  async recordSend(input: RecordSendInput): Promise<string> {
    const id = input.id ?? generateUUID();
    await this.db
      .prepare(
        `INSERT INTO email_sends
          (id, service_id, type, sender, recipient, subject, body, provider, provider_message_id, status, fallback_used, error, in_reply_to, thread_id, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.service_id,
        input.type,
        input.sender,
        input.recipient,
        input.subject ?? null,
        input.body ? input.body.slice(0, 200_000) : null,
        input.provider ?? null,
        input.provider_message_id ?? null,
        input.status,
        input.fallback_used ? 1 : 0,
        input.error ?? null,
        input.in_reply_to ?? null,
        input.thread_id ?? id,
        input.attachments ?? null
      )
      .run();
    return id;
  }

  // ---- inbound ----

  async insertInbound(input: InboundInput): Promise<string> {
    const id = generateUUID();
    await this.db
      .prepare(
        `INSERT INTO inbound_messages
          (id, message_id, from_addr, to_addr, subject, in_reply_to, refs, snippet, raw_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.message_id ?? null,
        input.from_addr,
        input.to_addr,
        input.subject ?? null,
        input.in_reply_to ?? null,
        input.refs ?? null,
        input.snippet ?? null,
        input.raw_size ?? null
      )
      .run();
    return id;
  }

  async listInbound(limit: number): Promise<InboundRow[]> {
    const res = await this.db
      .prepare('SELECT * FROM inbound_messages ORDER BY received_at DESC LIMIT ?')
      .bind(Math.max(1, Math.min(limit, 200)))
      .all<InboundRow>();
    return res.results ?? [];
  }

  async getInbound(id: string): Promise<InboundRow | null> {
    return this.db
      .prepare('SELECT * FROM inbound_messages WHERE id = ?')
      .bind(id)
      .first<InboundRow>();
  }

  async markReplied(id: string): Promise<void> {
    await this.db
      .prepare(`UPDATE inbound_messages SET replied_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();
  }

  /**
   * Retention: opportunistically delete service-send rows older than 30 days
   * (mailbox mail — dashboard/reply — is kept). Called with low
   * probability from the /send hot path — no cron job needed, capped per call to stay cheap.
   */
  async pruneOldSends(): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM email_sends WHERE id IN (
           SELECT id FROM email_sends WHERE created_at < datetime('now', '-30 days')
             AND type NOT IN ('dashboard', 'reply') LIMIT 500
         )`
      )
      .run();
  }

  // ---- audit ----

  async createAuditLog(input: { service_id?: string | null; action: string; meta?: unknown }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO audit_log (id, service_id, action, meta_json) VALUES (?, ?, ?, ?)`)
      .bind(
        generateUUID(),
        input.service_id ?? null,
        input.action,
        input.meta !== undefined ? JSON.stringify(input.meta) : null
      )
      .run();
  }

  // ---- readiness ----

  async ping(): Promise<boolean> {
    try {
      await this.db.prepare('SELECT 1').first();
      return true;
    } catch {
      return false;
    }
  }
}
