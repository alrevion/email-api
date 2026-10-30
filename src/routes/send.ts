import { Hono } from 'hono';
import type { Context } from 'hono';

import { Config, Env } from '../config';
import { Database } from '../db';
import { RateLimiter } from '../rate-limit';
import { ApiError, authenticateService, ServiceContext } from '../auth';
import { handleWorkerRouteError } from '../hono-errors';
import { isValidEmail, sanitizeHeaderValue } from '../crypto';
import { sendWithFallback } from '../providers';
import { renderTemplate } from '../templates';

interface SendBody {
  type?: string;
  from?: string;
  from_name?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  template?: string;
  vars?: Record<string, unknown>;
  reply_to?: string;
}

const VALID_TYPES = new Set(['otp', 'reset', 'verify', 'custom']);
// Bodies for these types are never persisted in email_sends (OTP/reset codes stored
// in plaintext forever). Only "custom" (owner-composed) mail keeps its body for the cabinet.
const REDACT_BODY_TYPES = new Set(['otp', 'reset', 'verify']);

/** Merge client vars with server-controlled ones; app_name always comes from config. */
function buildTemplateVars(config: Config, vars?: Record<string, unknown>): Record<string, unknown> {
  return { ...(vars || {}), app_name: config.appName };
}

/** verify_url must be https and its origin allowlisted (otherwise = phishing link). */
function assertAllowedVerifyUrl(url: string, config: Config): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError('invalid_request', 'Invalid "verify_url"', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw new ApiError('invalid_request', '"verify_url" must be https', 400);
  }
  if (!config.verifyUrlAllowedOrigins.includes(parsed.origin)) {
    throw new ApiError('invalid_request', '"verify_url" origin not allowed', 400);
  }
}

/** CR/LF-strip + drop mailbox-syntax chars a display name has no business containing. */
function sanitizeFromName(name: string): string {
  return sanitizeHeaderValue(name).replace(/[<>",;@]/g, '').trim();
}

export function createSendRoutes(db: Database, config: Config) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleWorkerRouteError);

  app.post('/send', async (c: Context) => {
    const service = await authenticateService(c.req.header('authorization') || null, db, config);
    const body = (await c.req.json().catch(() => null)) as SendBody | null;
    if (!body) throw new ApiError('invalid_request', 'Invalid JSON body', 400);

    const type = (body.type || 'custom').toLowerCase();
    if (!VALID_TYPES.has(type)) {
      throw new ApiError('invalid_request', `Unknown type: ${type}`, 400);
    }
    if (!service.allowed_types.includes(type)) {
      throw new ApiError('forbidden', `This key may not send type "${type}"`, 403);
    }

    // Retention: no cron, so prune old rows opportunistically off the hot path.
    if (Math.random() < 1 / 50) {
      tryWaitUntil(c, () => db.pruneOldSends());
    }

    const to = (body.to || '').trim();
    if (!isValidEmail(to)) throw new ApiError('invalid_request', 'Valid "to" is required', 400);

    // Sender: optional `from`, must be in the key's allowed_senders. Defaults to noreply@ if the
    // key has it, else the key's first allowed sender. team@ stays owner-only (never in service keys).
    const requestedFrom = (body.from || '').trim().toLowerCase();
    let sender: string;
    if (requestedFrom) {
      sender = service.allowed_senders.find((s) => s.toLowerCase() === requestedFrom) || '';
      if (!sender) throw new ApiError('forbidden', `This key may not send from "${requestedFrom}"`, 403);
    } else {
      sender =
        service.allowed_senders.find((s) => s.toLowerCase() === config.noreplyAddress.toLowerCase()) ||
        service.allowed_senders[0];
      if (!sender) throw new ApiError('forbidden', 'This key has no allowed sender', 403);
    }
    const fromName =
      sanitizeFromName((body.from_name || '').trim() || config.senderNameFor(sender)) ||
      config.senderNameFor(sender);

    // Resolve content. Non-custom types are template-only: a key scoped to e.g. "otp"
    // must not be able to send an arbitrary subject/html/text — that's an unauthenticated phishing
    // primitive from a trusted (noreply@, DKIM-valid) address.
    let subject: string;
    let html: string | undefined;
    let text: string | undefined;
    if (type === 'custom') {
      subject = (body.subject || '').trim();
      html = body.html;
      text = body.text;
      if (body.template) {
        const rendered = renderTemplate(body.template, buildTemplateVars(config, body.vars));
        subject = subject || rendered.subject;
        html = html || rendered.html;
        text = text || rendered.text;
      }
    } else {
      if (body.html || body.text || body.subject) {
        throw new ApiError(
          'raw_content_not_allowed',
          `Type "${type}" may not send raw html/text/subject; use "template": "${type}"`,
          400
        );
      }
      const templateName = (body.template || '').toLowerCase();
      if (templateName !== type) {
        throw new ApiError('invalid_request', `"template" must equal "type" ("${type}")`, 400);
      }
      const vars = buildTemplateVars(config, body.vars);
      if (type === 'verify' && typeof vars.verify_url === 'string' && vars.verify_url) {
        assertAllowedVerifyUrl(vars.verify_url, config);
      }
      const rendered = renderTemplate(templateName, vars);
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text;
    }
    subject = sanitizeHeaderValue(subject);
    if (!subject) throw new ApiError('invalid_request', '"subject" is required', 400);
    if (!html && !text) throw new ApiError('invalid_request', 'Provide "html", "text" or "template"', 400);

    let replyTo: string | undefined;
    if (body.reply_to?.trim()) {
      replyTo = body.reply_to.trim();
      if (!isValidEmail(replyTo)) throw new ApiError('invalid_request', 'Invalid "reply_to"', 400);
    }

    await enforceRateLimits(c, config, service, to);

    try {
      const outcome = await sendWithFallback(config, {
        from: sender,
        fromName,
        to,
        subject,
        html,
        text,
        replyTo,
      });
      await db.recordSend({
        service_id: service.id,
        type,
        sender,
        recipient: to,
        subject,
        body: REDACT_BODY_TYPES.has(type) ? null : text || html,
        provider: outcome.provider,
        provider_message_id: outcome.messageId,
        status: 'sent',
        fallback_used: outcome.fallbackUsed,
      });
      return c.json({ ok: true, message_id: outcome.messageId, provider: outcome.provider, fallback_used: outcome.fallbackUsed });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.recordSend({ service_id: service.id, type, sender, recipient: to, subject, status: 'failed', error });
      throw new ApiError('provider_error', 'Email delivery failed', 502);
    }
  });

  return app;
}

/** Best-effort background task; no-op (never blocks the request) when no execution context exists. */
function tryWaitUntil(c: Context, fn: () => Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(fn().catch(() => {}));
  } catch {
    // no execution context (e.g. local/test invocation) — skip
  }
}

async function enforceRateLimits(
  c: Context,
  config: Config,
  service: ServiceContext,
  recipient: string
): Promise<void> {
  const limiter = new RateLimiter((c.env as Env).RATE_LIMIT);

  // Per-key cap: explicit key value, else a non-zero default ceiling (no fail-open on unset keys).
  const keyLimit = service.send_limit_per_hour > 0 ? service.send_limit_per_hour : config.defaultKeyLimitPerHour;
  if (keyLimit > 0) {
    const r = await limiter.check(`key:${service.id}`, keyLimit, 3600);
    if (!r.allowed) {
      throw new ApiError('rate_limited', 'Per-key hourly send limit exceeded', 429, r.retryAfterSeconds);
    }
  }

  const perRecipient = config.sendPerRecipientPerHour;
  if (perRecipient > 0) {
    const r = await limiter.check(`recipient:${service.id}:${recipient.toLowerCase()}`, perRecipient, 3600);
    if (!r.allowed) {
      throw new ApiError('rate_limited', 'Per-recipient hourly send limit exceeded', 429, r.retryAfterSeconds);
    }
  }
}
