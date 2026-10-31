import { Hono } from 'hono';
import type { Context } from 'hono';

import { Config, Env } from '../config';
import { Database } from '../db';
import { ApiError } from '../auth';
import { handleWorkerRouteError } from '../hono-errors';
import { isValidEmail, sanitizeHeaderValue, secretEqual } from '../crypto';
import { sendWithFallback } from '../providers';
import { Folder, INBOUND_FOLDERS, Mailbox, mergeBoxes, referencesHeader, safeFilename } from '../mailbox';
import type { OutgoingAttachment } from '../providers';
import { createSessionCookie, clearSessionCookie, verifySession } from '../dashboard/session';
import { isBlocked, registerFailure, clearLockout } from '../dashboard/lockout';
import { Drafts, cleanDraft } from '../drafts';
import { vapidPublicKey } from '../push';

interface ComposeBody {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  inbound_id?: string;
  draft_id?: string;
  /** Forward: the original message's attachments are attached server-side. */
  forward?: { kind?: string; id?: string };
  attachments?: Array<{ filename?: string; content?: string }>;
}

const FOLDERS: Folder[] = ['inbox', 'archive', 'trash', 'sent', 'system'];
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // total, decoded — under Brevo/Resend caps

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function validateAttachments(input: ComposeBody['attachments']): OutgoingAttachment[] {
  if (!input?.length) return [];
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS) {
    throw new ApiError('invalid_request', `Up to ${MAX_ATTACHMENTS} attachments`, 400);
  }
  let total = 0;
  return input.map((a) => {
    const content = (a?.content || '').replace(/\s+/g, '');
    if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
      throw new ApiError('invalid_request', 'Attachment content must be base64', 400);
    }
    total += Math.floor((content.length * 3) / 4);
    if (total > MAX_ATTACHMENT_BYTES) throw new ApiError('invalid_request', 'Attachments exceed 10 MB', 400);
    return { filename: safeFilename(a.filename || 'file'), content };
  });
}

async function requireSession(c: Context, config: Config): Promise<void> {
  const ok = await verifySession(c.req.header('cookie') || null, config.sessionSecret);
  if (!ok) throw new ApiError('unauthorized', 'Not signed in', 401);
}

/** Personal mail cabinet: SPA + cookie-session API (login by DASHBOARD_PASSWORD). */
export function createDashboardRoutes(db: Database, config: Config) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleWorkerRouteError);

  // --- auth ---
  // Login = username + password. After 2 failed attempts the IP is blocked for 24h.
  // Lockout lives in the Cloudflare Cache API (per-colo, approximate, no KV/D1).
  app.post('/dashboard/api/login', async (c: Context) => {
    if (!config.dashboardLogin || !config.dashboardPassword) {
      throw new ApiError('dashboard_disabled', 'Dashboard credentials not configured', 503);
    }

    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const blockedFor = await isBlocked(ip);
    if (blockedFor > 0) {
      throw new ApiError('ip_blocked', 'Too many attempts — IP blocked for 24h', 429, blockedFor);
    }

    const body = (await c.req.json().catch(() => null)) as { login?: string; password?: string } | null;
    const okLogin = await secretEqual(body?.login || '', config.dashboardLogin);
    const okPw = await secretEqual(body?.password || '', config.dashboardPassword);

    if (okLogin && okPw) {
      await clearLockout(ip);
      c.header('Set-Cookie', await createSessionCookie(config.sessionSecret, config.sessionTtlSeconds));
      return c.json({ ok: true });
    }

    const res = await registerFailure(ip);
    if (res.blocked) {
      throw new ApiError('ip_blocked', 'Too many attempts — IP blocked for 24h', 429, res.retryAfter);
    }
    throw new ApiError('unauthorized', 'Invalid login or password', 401);
  });

  app.post('/dashboard/api/logout', (c: Context) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.json({ ok: true });
  });

  app.get('/dashboard/api/me', async (c: Context) => {
    await requireSession(c, config);
    return c.json({ ok: true });
  });

  const mailbox = (c: Context) => new Mailbox((c.env as Env).DB, (c.env as Env).MAIL);

  // Configured senders + every address that has received mail (new routes need no redeploy).
  const allSenders = async (c: Context) =>
    mergeBoxes(config.dashboardSenders, await mailbox(c).boxes());

  app.get('/dashboard/api/boxes', async (c: Context) => {
    await requireSession(c, config);
    return c.json({
      ok: true,
      senders: await allSenders(c),
      unread: await mailbox(c).unreadCounts(),
      drafts: await drafts(c).count(),
    });
  });

  // --- push notifications (Web Push; on iOS only from the home-screen app) ---
  app.get('/dashboard/api/push/key', async (c: Context) => {
    await requireSession(c, config);
    const jwk = (c.env as Env).VAPID_PRIVATE_KEY;
    if (!jwk) throw new ApiError('push_disabled', 'VAPID_PRIVATE_KEY not configured', 503);
    return c.json({ ok: true, key: vapidPublicKey(jwk) });
  });

  app.post('/dashboard/api/push/subscribe', async (c: Context) => {
    await requireSession(c, config);
    const b = (await c.req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
    const endpoint = String(b?.endpoint || '');
    const { p256dh = '', auth = '' } = b?.keys || {};
    const b64u = /^[A-Za-z0-9_-]+$/;
    if (!endpoint.startsWith('https://') || endpoint.length > 1000 || !b64u.test(p256dh) || !b64u.test(auth)) {
      throw new ApiError('invalid_request', 'Bad subscription', 400);
    }
    await (c.env as Env).DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    )
      .bind(endpoint, p256dh, auth)
      .run();
    return c.json({ ok: true });
  });

  app.post('/dashboard/api/push/unsubscribe', async (c: Context) => {
    await requireSession(c, config);
    const b = (await c.req.json().catch(() => null)) as { endpoint?: string } | null;
    await (c.env as Env).DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(String(b?.endpoint || '')).run();
    return c.json({ ok: true });
  });

  // --- drafts ---
  const drafts = (c: Context) => new Drafts((c.env as Env).DB);

  app.get('/dashboard/api/drafts', async (c: Context) => {
    await requireSession(c, config);
    return c.json({ ok: true, drafts: await drafts(c).list() });
  });

  app.put('/dashboard/api/drafts/:id', async (c: Context) => {
    await requireSession(c, config);
    const d = cleanDraft(c.req.param('id')!, (await c.req.json().catch(() => null)) as Record<string, unknown> | null);
    if (!d) throw new ApiError('invalid_request', 'Bad draft', 400);
    await drafts(c).save(d);
    return c.json({ ok: true });
  });

  app.delete('/dashboard/api/drafts/:id', async (c: Context) => {
    await requireSession(c, config);
    await drafts(c).remove(c.req.param('id')!);
    return c.json({ ok: true });
  });

  app.get('/dashboard/api/list', async (c: Context) => {
    await requireSession(c, config);
    const folder = (c.req.query('folder') || 'inbox') as Folder;
    if (!FOLDERS.includes(folder)) throw new ApiError('invalid_request', 'Unknown folder', 400);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const messages = await mailbox(c).list({
      folder,
      q: (c.req.query('q') || '').trim().slice(0, 200) || undefined,
      box: (c.req.query('box') || '').trim() || undefined,
      limit: 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return c.json({ ok: true, messages });
  });

  app.get('/dashboard/api/thread/:tid', async (c: Context) => {
    await requireSession(c, config);
    const messages = await mailbox(c).thread(c.req.param('tid')!);
    if (!messages.length) throw new ApiError('not_found', 'Thread not found', 404);
    return c.json({ ok: true, messages });
  });

  app.post('/dashboard/api/thread/:tid/folder', async (c: Context) => {
    await requireSession(c, config);
    const body = (await c.req.json().catch(() => null)) as { folder?: string } | null;
    const folder = body?.folder as (typeof INBOUND_FOLDERS)[number];
    if (!INBOUND_FOLDERS.includes(folder)) throw new ApiError('invalid_request', 'Unknown folder', 400);
    await mailbox(c).setFolder(c.req.param('tid')!, folder);
    return c.json({ ok: true });
  });

  app.post('/dashboard/api/thread/:tid/unread', async (c: Context) => {
    await requireSession(c, config);
    await mailbox(c).markUnread(c.req.param('tid')!);
    return c.json({ ok: true });
  });

  // Permanent delete — only messages already in the trash.
  app.delete('/dashboard/api/thread/:tid', async (c: Context) => {
    await requireSession(c, config);
    const deleted = await mailbox(c).purge(c.req.param('tid')!);
    return c.json({ ok: true, deleted });
  });

  app.get('/dashboard/api/attachment/:kind/:id/:idx', async (c: Context) => {
    await requireSession(c, config);
    const kind = c.req.param('kind');
    if (kind !== 'in' && kind !== 'out') throw new ApiError('invalid_request', 'Bad kind', 400);
    const att = await mailbox(c).attachment(kind, c.req.param('id')!, parseInt(c.req.param('idx')!, 10));
    if (!att) throw new ApiError('not_found', 'Attachment not found', 404);
    // Always a download, never rendered on our origin (an .html attachment must not run with the session cookie).
    return new Response(att.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
      },
    });
  });

  // --- compose / reply ---
  app.post('/dashboard/api/compose', async (c: Context) => {
    await requireSession(c, config);
    const body = (await c.req.json().catch(() => null)) as ComposeBody | null;
    if (!body) throw new ApiError('invalid_request', 'Invalid JSON body', 400);

    let to = (body.to || '').trim();
    let subject = (body.subject || '').trim();
    let inReplyTo = '';
    let references = '';
    let inboundId: string | undefined;
    let threadId: string | undefined;
    let replyBox = '';

    if (body.inbound_id) {
      const inbound = await db.getInbound(body.inbound_id);
      if (!inbound) throw new ApiError('not_found', 'inbound_id not found', 404);
      inboundId = inbound.id;
      threadId = inbound.thread_id || inbound.id;
      replyBox = inbound.to_addr.toLowerCase();
      if (!to) to = inbound.from_addr;
      if (!subject) subject = inbound.subject ? `Re: ${inbound.subject}` : '(no subject)';
      if (inbound.message_id) inReplyTo = inbound.message_id;
      references = referencesHeader(inbound.refs, inbound.message_id);
    }

    if (!isValidEmail(to)) throw new ApiError('invalid_request', 'Valid "to" is required', 400);
    if (!subject) throw new ApiError('invalid_request', '"subject" is required', 400);
    if (!body.html && !body.text) throw new ApiError('invalid_request', 'Provide "html" or "text"', 400);
    const given = Array.isArray(body.attachments) ? body.attachments : [];
    const fwd = body.forward;
    if (fwd?.id && (fwd.kind === 'in' || fwd.kind === 'out')) {
      for (let i = 0; i < MAX_ATTACHMENTS; i++) {
        const att = await mailbox(c).attachment(fwd.kind, fwd.id, i);
        if (!att) break;
        given.push({ filename: att.name, content: toBase64(new Uint8Array(await new Response(att.body).arrayBuffer())) });
      }
    }
    const attachments = validateAttachments(given);

    // Sender restricted to the cabinet's allowed list. A reply defaults to the address it was sent to.
    const requested = (body.from || '').trim().toLowerCase() || replyBox;
    const senders = await allSenders(c);
    const sender = requested
      ? senders.find((s) => s.toLowerCase() === requested) || (body.from ? undefined : senders[0])
      : senders[0];
    if (!sender) throw new ApiError('forbidden', 'Sender not allowed', 403);

    const headers: Record<string, string> = {};
    if (inReplyTo) headers['In-Reply-To'] = sanitizeHeaderValue(inReplyTo);
    if (references) headers['References'] = sanitizeHeaderValue(references);

    let outcome;
    try {
      outcome = await sendWithFallback(config, {
        from: sender,
        fromName: config.senderNameFor(sender),
        to,
        subject,
        html: body.html,
        text: body.text,
        headers: Object.keys(headers).length ? headers : undefined,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.recordSend({
        service_id: null, type: inboundId ? 'reply' : 'dashboard', sender, recipient: to, subject,
        body: body.text || body.html, thread_id: threadId, status: 'failed', error,
      });
      throw new ApiError('provider_error', 'Send failed', 502);
    }

    // Mail is out: from here on a storage error must not look like a failed send (user would resend).
    const sendId = crypto.randomUUID();
    const attMeta = await mailbox(c)
      .saveSentAttachments(sendId, attachments)
      .catch((e) => {
        console.error('[email-api] sent attachment store failed:', e instanceof Error ? e.message : String(e));
        return JSON.stringify(attachments.map((a) => ({ name: a.filename, type: '', size: 0 })));
      });
    try {
      await db.recordSend({
        id: sendId,
        thread_id: threadId,
        attachments: attMeta ?? undefined,
        service_id: null,
        type: inboundId ? 'reply' : 'dashboard',
        sender,
        recipient: to,
        subject,
        body: body.text || body.html,
        provider: outcome.provider,
        provider_message_id: outcome.messageId,
        status: 'sent',
        fallback_used: outcome.fallbackUsed,
        in_reply_to: inReplyTo || undefined,
      });
      if (inboundId) await db.markReplied(inboundId);
      if (body.draft_id) await drafts(c).remove(String(body.draft_id));
    } catch (e) {
      console.error('[email-api] sent log failed:', e instanceof Error ? e.message : String(e));
    }
    return c.json({ ok: true, message_id: outcome.messageId, provider: outcome.provider });
  });

  return app;
}
