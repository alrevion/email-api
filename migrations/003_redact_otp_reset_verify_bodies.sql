-- AUDIT.md B3: OTP/reset/verify bodies were stored in plaintext indefinitely, visible in the
-- cabinet. New sends of these types are redacted at write time (see src/routes/send.ts); this
-- migration redacts rows written before that fix. Custom/dashboard/reply mail keeps its body.
UPDATE email_sends SET body = NULL WHERE type IN ('otp', 'reset', 'verify');

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('003_redact_otp_reset_verify_bodies');
