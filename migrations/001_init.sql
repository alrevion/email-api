-- D1 (SQLite) schema for Alrevion email-api
-- Single send point (Brevo→Resend) + team@ inbound/reply.

-- Services = API-key identities (callers). Scope: which email types + which senders.
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  api_key_prefix TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'service' CHECK(role IN ('service', 'owner')),
  allowed_types TEXT NOT NULL DEFAULT '["otp","reset","verify"]',
  allowed_senders TEXT NOT NULL DEFAULT '["noreply@alrevion.com"]',
  send_limit_per_hour INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS services_api_key_hash_idx ON services (api_key_hash);

-- Optional per-service CIDR allowlist (parity with telegram-otp; enforced if rows exist).
CREATE TABLE IF NOT EXISTS service_ip_allowlist (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  cidr TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS service_ip_allowlist_service_idx ON service_ip_allowlist (service_id);

-- Outbound send log (audit + metering + which provider delivered).
CREATE TABLE IF NOT EXISTS email_sends (
  id TEXT PRIMARY KEY,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  fallback_used INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  in_reply_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS email_sends_service_ts_idx ON email_sends (service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_sends_status_idx ON email_sends (status, created_at DESC);

-- Inbound messages to team@ (captured by the Email Worker, for /reply threading + list).
CREATE TABLE IF NOT EXISTS inbound_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  in_reply_to TEXT,
  refs TEXT,
  snippet TEXT,
  raw_size INTEGER,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  replied_at TEXT
);

CREATE INDEX IF NOT EXISTS inbound_messages_received_idx ON inbound_messages (received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_message_id_idx ON inbound_messages (message_id);

-- Audit log.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS audit_log_service_ts_idx ON audit_log (service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);

-- Schema migrations tracking.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('001_init');
