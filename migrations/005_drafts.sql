-- Dashboard drafts: autosaved compose state. Attachments are not kept (re-add on send).
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  from_addr TEXT,
  to_addr TEXT,
  subject TEXT,
  body TEXT,
  quote TEXT,          -- quoted original, appended on send
  inbound_id TEXT,     -- reply target (threading)
  fwd_kind TEXT,       -- forward source: in|out
  fwd_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS drafts_updated_idx ON drafts (updated_at DESC);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('005_drafts');
