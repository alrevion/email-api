-- Full mailbox: raw .eml in R2 (MAIL bucket), folders, read state, threads, attachments metadata.
ALTER TABLE inbound_messages ADD COLUMN from_name TEXT;
ALTER TABLE inbound_messages ADD COLUMN raw_key TEXT;
ALTER TABLE inbound_messages ADD COLUMN attachments TEXT; -- JSON [{name,type,size}]
ALTER TABLE inbound_messages ADD COLUMN read_at TEXT;
ALTER TABLE inbound_messages ADD COLUMN folder TEXT NOT NULL DEFAULT 'inbox'; -- inbox|archive|trash
ALTER TABLE inbound_messages ADD COLUMN thread_id TEXT;

ALTER TABLE email_sends ADD COLUMN thread_id TEXT;
ALTER TABLE email_sends ADD COLUMN attachments TEXT; -- JSON [{name,type,size}], content in R2 sent/<id>/<i>

UPDATE inbound_messages SET thread_id = id WHERE thread_id IS NULL;
UPDATE inbound_messages SET read_at = received_at WHERE read_at IS NULL; -- old mail counts as read
UPDATE email_sends SET thread_id = COALESCE(
  (SELECT i.thread_id FROM inbound_messages i WHERE i.message_id = email_sends.in_reply_to LIMIT 1), id)
WHERE thread_id IS NULL;

CREATE INDEX IF NOT EXISTS inbound_messages_folder_idx ON inbound_messages (folder, received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_thread_idx ON inbound_messages (thread_id);
CREATE INDEX IF NOT EXISTS email_sends_thread_idx ON email_sends (thread_id);
CREATE INDEX IF NOT EXISTS email_sends_msgid_idx ON email_sends (provider_message_id);
CREATE INDEX IF NOT EXISTS email_sends_type_ts_idx ON email_sends (type, created_at DESC);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('004_mailbox');
