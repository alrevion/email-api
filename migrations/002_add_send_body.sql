-- Store the sent body so the cabinet's "Исходящие" (Sent) view can show full content.
ALTER TABLE email_sends ADD COLUMN body TEXT;

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('002_add_send_body');
