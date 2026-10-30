import { Hono } from 'hono';
import type { Context } from 'hono';

import { Config, Env } from '../config';
import { Database } from '../db';
import { ApiError, authenticateOwner } from '../auth';
import { handleWorkerRouteError } from '../hono-errors';
import { isValidEmail, sanitizeHeaderValue } from '../crypto';
import { RateLimiter } from '../rate-limit';
import { sendWithFallback } from '../providers';
import { referencesHeader } from '../mailbox';

interface ReplyBody {
  inbound_id?: string;
  from?: string;
  from_name?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  in_reply_to?: string;
  references?: string;
}

/** Owner-only: list captured team@ inbound + reply from team@ with threading headers. */
export function createReplyRoutes(db: Database, config: Config) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleWorkerRouteError);

  app.get('/inbound', async (c: Context) => {
    await authenticateOwner(c.req.header('authorization') || null, db, config);
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const rows = await db.listInbound(Number.isFinite(limit) ? limit : 50);
    return c.json({ ok: true, messages: rows });
  });

  app.get('/inbound/:id', async (c: Context) => {
    await authenticateOwner(c.req.header('authorization') || null, db, config);
    const row = await db.getInbound(c.req.param('id')!);
    if (!row) throw new ApiError('not_found', 'Inbound message not found', 404);
    return c.json({ ok: true, message: row });
  });

  app.post('/reply', async (c: Context) => {
    const owner = await authenticateOwner(c.req.header('authorization') || null, db, config);
    const body = (await c.req.json().catch(() => null)) as ReplyBody | null;
    if (!body) throw new ApiError('invalid_request', 'Invalid JSON body', 400);

    let to = (body.to || '').trim();
    let subject = (body.subject || '').trim();
    let inReplyTo = (body.in_reply_to || '').trim();
    let references = (body.references || '').trim();

    // If replying to a captured inbound message, derive recipient/subject/threading.
    let inboundId: string | undefined;
    let threadId: string | undefined;
    if (body.inbound_id) {
      const inbound = await db.getInbound(body.inbound_id);
      if (!inbound) throw new ApiError('not_found', 'inbound_id not found', 404);
      inboundId = inbound.id;
      threadId = inbound.thread_id || inbound.id;
      if (!to) to = inbound.from_addr;
      if (!subject) subject = inbound.subject ? prefixRe(inbound.subject) : '(no subject)';
      if (!inReplyTo && inbound.message_id) inReplyTo = inbound.message_id;
      if (!references) {
        references = referencesHeader(inbound.refs, inbound.message_id);
      }
    }

    if (!isValidEmail(to)) throw new ApiError('invalid_request', 'Valid "to" is required', 400);
    if (!subject) throw new ApiError('invalid_request', '"subject" is required', 400);
    if (!body.html && !body.text) throw new ApiError('invalid_request', 'Provide "html" or "text"', 400);

    // Sender: optional `from` (e.g. eschool@), validated against the owner key's allowed_senders.
    // Defaults to team@. Lets the owner reply/send as team@ OR eschool@ etc.
    const requestedFrom = (body.from || '').trim().toLowerCase();
    let sender: string;
    if (requestedFrom) {
      sender = owner.allowed_senders.find((s) => s.toLowerCase() === requestedFrom) || '';
      if (!sender) throw new ApiError('forbidden', `This owner key may not send from "${requestedFrom}"`, 403);
    } else {
      sender =
        owner.allowed_senders.find((s) => s.toLowerCase() === config.teamAddress.toLowerCase()) ||
        owner.allowed_senders[0];
      if (!sender) throw new ApiError('forbidden', 'This owner key has no allowed sender', 403);
    }
    const fromName = (body.from_name || '').trim() || config.senderNameFor(sender);

    const headers: Record<string, string> = {};
    if (inReplyTo) headers['In-Reply-To'] = sanitizeHeaderValue(inReplyTo);
    if (references) headers['References'] = sanitizeHeaderValue(references);

    // Per-recipient throttle (a compromised owner key should still be capped).
    const perRecipient = config.sendPerRecipientPerHour;
    if (perRecipient > 0) {
      const limiter = new RateLimiter((c.env as Env).RATE_LIMIT);
      const rl = await limiter.check(`reply:${owner.id}:${to.toLowerCase()}`, perRecipient, 3600);
      if (!rl.allowed) {
        throw new ApiError('rate_limited', 'Per-recipient hourly reply limit exceeded', 429, rl.retryAfterSeconds);
      }
    }

    try {
      const outcome = await sendWithFallback(config, {
        from: sender,
        fromName,
        to,
        subject,
        html: body.html,
        text: body.text,
        headers: Object.keys(headers).length ? headers : undefined,
      });
      await db.recordSend({
        service_id: owner.id,
        type: 'reply',
        sender,
        recipient: to,
        subject,
        body: body.text || body.html,
        provider: outcome.provider,
        provider_message_id: outcome.messageId,
        status: 'sent',
        fallback_used: outcome.fallbackUsed,
        in_reply_to: inReplyTo || undefined,
        thread_id: threadId,
      });
      if (inboundId) await db.markReplied(inboundId);
      return c.json({ ok: true, message_id: outcome.messageId, provider: outcome.provider });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.recordSend({ service_id: owner.id, type: 'reply', sender, recipient: to, subject, status: 'failed', error });
      throw new ApiError('provider_error', 'Reply delivery failed', 502);
    }
  });

  return app;
}

function prefixRe(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}
