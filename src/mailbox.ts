import PostalMime from 'postal-mime';

import { generateUUID } from './crypto';
import type { OutgoingAttachment } from './providers';

type ParsedEmail = Awaited<ReturnType<typeof PostalMime.parse>>;

export interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
}

export type Folder = 'inbox' | 'archive' | 'trash' | 'sent' | 'system';
export const INBOUND_FOLDERS = ['inbox', 'archive', 'trash'] as const;
const MAILBOX_SEND_TYPES = `('dashboard', 'reply')`;

/** One row in the message list (inbound or outbound, same shape for the UI). */
export interface ListItem {
  kind: 'in' | 'out';
  id: string;
  thread_id: string;
  addr: string; // counterparty
  name: string | null;
  box: string; // our address (to_addr for inbound, sender for outbound)
  subject: string | null;
  snippet: string | null;
  at: string;
  unread: number;
  replied: number;
  attachments: string | null;
  status: string | null;
  n?: number; // messages in thread (inbound folders)
}

export interface ThreadMessage {
  kind: 'in' | 'out';
  id: string;
  from: string;
  from_name: string | null;
  to: string;
  subject: string | null;
  at: string;
  text: string | null;
  html: string | null;
  attachments: AttachmentMeta[];
  status?: string;
  error?: string | null;
  folder?: string;
  message_id?: string | null;
}

const RE_PREFIX = /^\s*((re|fwd?|aw|wg|sv|antw|ответ|отв|пересл)\s*(\[\d+\])?\s*:\s*)+/i;

export function normalizeSubject(subject?: string | null): string {
  return (subject || '').replace(RE_PREFIX, '').trim().toLowerCase();
}

/** "<a@x> <b@y>" → ["<a@x>", "a@x", "<b@y>", "b@y"] (stored ids may or may not carry brackets). */
export function messageIdVariants(...headers: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const h of headers) {
    const ids = (h || '').match(/<[^<>\s]+>/g) || ((h || '').trim() ? [(h || '').trim()] : []);
    for (const id of ids) {
      const bare = id.replace(/^<|>$/g, '');
      out.add(`<${bare}>`);
      out.add(bare);
    }
  }
  return [...out].slice(-40); // D1 bind-param cap; newest references are last
}

/** References header for a reply: prior refs + the parent id, newest last, capped (RFC 5322 line length). */
export function referencesHeader(refs: string | null | undefined, parentId: string | null | undefined): string {
  const ids = [...((refs || '').match(/<[^<>\s]+>/g) || []), ...((parentId || '').match(/<[^<>\s]+>/g) || [])];
  return [...new Set(ids)].slice(-10).join(' ');
}

/** Cabinet address list: configured senders first, then any other address that has received mail. */
export function mergeBoxes(configured: string[], seen: string[]): string[] {
  const have = new Set(configured.map((s) => s.toLowerCase()));
  return [...configured, ...seen.filter((a) => a && !have.has(a))];
}

export function textPreview(text?: string | null, html?: string | null): string {
  const src = text || (html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return src.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function byteLen(c: ArrayBuffer | Uint8Array | string): number {
  return typeof c === 'string' ? c.length : c.byteLength;
}

function firstMailbox(a: ParsedEmail['from']): { address: string; name: string } | null {
  if (!a) return null;
  if (a.address) return { address: a.address, name: a.name };
  const m = a.group?.[0];
  return m ? { address: m.address, name: m.name } : null;
}

export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return (name || 'file').replace(/[\x00-\x1f\x7f/\\"]/g, '_').slice(0, 200) || 'file';
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Mailbox {
  constructor(private db: D1Database, private bucket?: R2Bucket) {}

  /** Store an inbound message: raw .eml → R2, parsed metadata → D1. Returns the row id. */
  async ingest(raw: ArrayBuffer, envelope: { from: string; to: string }): Promise<string> {
    const email = await PostalMime.parse(raw).catch((e) => {
      console.error('[email-api] mime parse failed:', e instanceof Error ? e.message : String(e));
      return null;
    });

    // Same message delivered twice to the same address (sender retry) → keep one copy.
    if (email?.messageId) {
      const dup = await this.db
        .prepare(`SELECT id FROM inbound_messages WHERE message_id = ? AND lower(to_addr) = ?`)
        .bind(email.messageId, envelope.to.toLowerCase())
        .first<{ id: string }>();
      if (dup) return dup.id;
    }

    const id = generateUUID();
    let rawKey: string | null = null;
    if (this.bucket) {
      rawKey = `in/${id}.eml`;
      await this.bucket.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } });
      // Small parsed copy so opening a thread never re-parses multi-MB attachments.
      await this.bucket.put(`in/${id}.json`, JSON.stringify({ text: email?.text || null, html: email?.html || null }));
    }
    const from = firstMailbox(email?.from) || { address: envelope.from, name: '' };
    const atts: AttachmentMeta[] = (email?.attachments || []).map((a) => ({
      name: safeFilename(a.filename || 'attachment'),
      type: a.mimeType || 'application/octet-stream',
      size: byteLen(a.content),
    }));
    const threadId =
      (await this.findThread(email?.inReplyTo, email?.references, from.address, email?.subject)) || id;

    const insert = this.db
      .prepare(
        `INSERT INTO inbound_messages
          (id, message_id, from_addr, from_name, to_addr, subject, in_reply_to, refs, snippet, raw_size,
           raw_key, attachments, thread_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        email?.messageId || null,
        from.address,
        from.name || null,
        envelope.to,
        email?.subject || null,
        email?.inReplyTo || null,
        email?.references || null,
        textPreview(email?.text, email?.html),
        raw.byteLength,
        rawKey,
        atts.length ? JSON.stringify(atts) : null,
        threadId
      )
      .run();
    try {
      await insert;
    } catch (e) {
      if (rawKey) await this.bucket?.delete([rawKey, `in/${id}.json`]).catch(() => {});
      throw e;
    }
    return id;
  }

  /** Thread by In-Reply-To/References; fall back to same counterparty + same normalized subject. */
  async findThread(
    inReplyTo: string | null | undefined,
    refs: string | null | undefined,
    counterparty: string,
    subject: string | null | undefined
  ): Promise<string | null> {
    for (const header of [inReplyTo, refs]) {
      const ids = messageIdVariants(header);
      if (!ids.length) continue;
      const ph = ids.map(() => '?').join(',');
      const row = await this.db
        .prepare(
          `SELECT thread_id FROM inbound_messages WHERE message_id IN (${ph}) AND thread_id IS NOT NULL
           UNION ALL
           SELECT thread_id FROM email_sends WHERE provider_message_id IN (${ph}) AND thread_id IS NOT NULL
           LIMIT 1`
        )
        .bind(...ids, ...ids)
        .first<{ thread_id: string }>();
      if (row) return row.thread_id;
    }

    // ponytail: subject+sender fallback (Resend gives us no Message-ID to match on); can merge
    // unrelated mail with an identical subject from the same person. Fine for a support inbox.
    const norm = normalizeSubject(subject);
    if (!norm) return null;
    const addr = counterparty.toLowerCase();
    const res = await this.db
      .prepare(
        `SELECT thread_id, subject, received_at AS at FROM inbound_messages WHERE lower(from_addr) = ?
         UNION ALL
         SELECT thread_id, subject, created_at AS at FROM email_sends
           WHERE lower(recipient) = ? AND type IN ${MAILBOX_SEND_TYPES}
         ORDER BY at DESC LIMIT 100`
      )
      .bind(addr, addr)
      .all<{ thread_id: string | null; subject: string | null }>();
    const hit = (res.results || []).find((r) => r.thread_id && normalizeSubject(r.subject) === norm);
    return hit?.thread_id || null;
  }

  async list(opts: { folder: Folder; q?: string; box?: string; limit?: number; offset?: number }): Promise<ListItem[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
    const offset = Math.max(0, opts.offset ?? 0);
    const like = opts.q ? `%${opts.q.replace(/[%_\\]/g, (m) => '\\' + m)}%` : null;
    const box = opts.box?.toLowerCase() || null;

    if ((INBOUND_FOLDERS as readonly string[]).includes(opts.folder)) {
      const where = ['folder = ?'];
      const vals: unknown[] = [opts.folder];
      if (box) {
        where.push('lower(to_addr) = ?');
        vals.push(box);
      }
      if (like) {
        where.push(
          `(subject LIKE ?1x ESCAPE '\\' OR from_addr LIKE ?1x ESCAPE '\\' OR from_name LIKE ?1x ESCAPE '\\' OR snippet LIKE ?1x ESCAPE '\\')`
        );
      }
      // One row per thread: its newest message, unread/replied if any message in it is.
      const sql =
        `SELECT 'in' AS kind, id, thread_id, from_addr AS addr, from_name AS name, to_addr AS box, subject, snippet,
                received_at AS at, unread, replied, attachments, NULL AS status, n
         FROM (SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY received_at DESC) AS rn,
                 MAX(read_at IS NULL) OVER (PARTITION BY thread_id) AS unread,
                 MAX(replied_at IS NOT NULL) OVER (PARTITION BY thread_id) AS replied,
                 COUNT(*) OVER (PARTITION BY thread_id) AS n
               FROM inbound_messages WHERE ${where.join(' AND ')})
         WHERE rn = 1 ORDER BY received_at DESC LIMIT ? OFFSET ?`;
      return this.run(sql, vals, like, limit, offset);
    }

    const where = [opts.folder === 'sent' ? `type IN ${MAILBOX_SEND_TYPES}` : `type NOT IN ${MAILBOX_SEND_TYPES}`];
    const vals: unknown[] = [];
    if (box) {
      where.push('lower(sender) = ?');
      vals.push(box);
    }
    if (like) {
      where.push(`(subject LIKE ?1x ESCAPE '\\' OR recipient LIKE ?1x ESCAPE '\\' OR body LIKE ?1x ESCAPE '\\')`);
    }
    const sql =
      `SELECT 'out' AS kind, id, thread_id, recipient AS addr, NULL AS name, sender AS box,
              subject, substr(body, 1, 300) AS snippet, created_at AS at, 0 AS unread, 0 AS replied, attachments, status
       FROM email_sends WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    return this.run(sql, vals, like, limit, offset);
  }

  /** `?1x` marks every LIKE placeholder (one search term reused across columns). */
  private async run(sql: string, vals: unknown[], like: string | null, limit: number, offset: number) {
    const n = (sql.match(/\?1x/g) || []).length;
    const bound = [...vals, ...Array(n).fill(like), limit, offset];
    const res = await this.db.prepare(sql.replace(/\?1x/g, '?')).bind(...bound).all<ListItem>();
    return res.results || [];
  }

  /** Every address that has received mail — a new Email Routing rule shows up here without a redeploy. */
  async boxes(): Promise<string[]> {
    const res = await this.db
      .prepare(`SELECT DISTINCT lower(to_addr) AS a FROM inbound_messages`)
      .all<{ a: string }>();
    return (res.results || []).map((r) => r.a);
  }

  async unreadCounts(): Promise<Record<string, number>> {
    const res = await this.db
      .prepare(`SELECT folder, COUNT(*) AS n FROM inbound_messages WHERE read_at IS NULL GROUP BY folder`)
      .all<{ folder: string; n: number }>();
    const out: Record<string, number> = {};
    for (const r of res.results || []) out[r.folder] = r.n;
    return out;
  }

  /** Whole conversation, oldest first. Marks its inbound messages read. */
  async thread(threadId: string): Promise<ThreadMessage[]> {
    const [ins, outs] = await Promise.all([
      this.db
        .prepare(`SELECT * FROM inbound_messages WHERE thread_id = ? ORDER BY received_at LIMIT 200`)
        .bind(threadId)
        .all<Record<string, any>>(),
      this.db
        .prepare(
          `SELECT * FROM email_sends WHERE thread_id = ? ORDER BY created_at LIMIT 200`
        )
        .bind(threadId)
        .all<Record<string, any>>(),
    ]);

    const inbound: ThreadMessage[] = [];
    for (const r of ins.results || []) {
      // Sequential on purpose: bounded memory even for threads with many large messages.
      const email = await this.loadBody(r.id, r.raw_key);
      inbound.push({
          kind: 'in',
          id: r.id,
          from: r.from_addr,
          from_name: r.from_name,
          to: r.to_addr,
          subject: r.subject,
          at: r.received_at,
          text: email ? email.text || null : r.snippet,
          html: email?.html || null,
          attachments: parseMeta(r.attachments),
          folder: r.folder,
          message_id: r.message_id,
      });
    }
    const outbound = (outs.results || []).map(
      (r): ThreadMessage => ({
        kind: 'out',
        id: r.id,
        from: r.sender,
        from_name: null,
        to: r.recipient,
        subject: r.subject,
        at: r.created_at,
        text: r.body,
        html: null,
        attachments: parseMeta(r.attachments),
        status: r.status,
        error: r.error,
      })
    );

    await this.db
      .prepare(`UPDATE inbound_messages SET read_at = datetime('now') WHERE thread_id = ? AND read_at IS NULL`)
      .bind(threadId)
      .run();
    return [...inbound, ...outbound].sort((a, b) => a.at.localeCompare(b.at));
  }

  async setFolder(threadId: string, folder: 'inbox' | 'archive' | 'trash'): Promise<void> {
    await this.db.prepare(`UPDATE inbound_messages SET folder = ? WHERE thread_id = ?`).bind(folder, threadId).run();
  }

  async markUnread(threadId: string): Promise<void> {
    // Only the newest inbound message, like a regular mail client.
    await this.db
      .prepare(
        `UPDATE inbound_messages SET read_at = NULL WHERE id = (
           SELECT id FROM inbound_messages WHERE thread_id = ? ORDER BY received_at DESC LIMIT 1)`
      )
      .bind(threadId)
      .run();
  }

  /** Permanently delete a thread's trashed inbound messages (rows + raw .eml). */
  async purge(threadId: string): Promise<number> {
    const res = await this.db
      .prepare(`SELECT id, raw_key FROM inbound_messages WHERE thread_id = ? AND folder = 'trash'`)
      .bind(threadId)
      .all<{ id: string; raw_key: string | null }>();
    const rows = res.results || [];
    const keys = rows.flatMap((r) => (r.raw_key ? [r.raw_key, `in/${r.id}.json`] : []));
    if (keys.length && this.bucket) await this.bucket.delete(keys);
    await this.db
      .prepare(`DELETE FROM inbound_messages WHERE thread_id = ? AND folder = 'trash'`)
      .bind(threadId)
      .run();
    return rows.length;
  }

  async getInboundMeta(id: string): Promise<{ to_addr: string; thread_id: string | null } | null> {
    return this.db
      .prepare(`SELECT to_addr, thread_id FROM inbound_messages WHERE id = ?`)
      .bind(id)
      .first();
  }

  async saveSentAttachments(sendId: string, atts: OutgoingAttachment[]): Promise<string | null> {
    if (!atts.length) return null;
    const meta: AttachmentMeta[] = [];
    for (let i = 0; i < atts.length; i++) {
      const bytes = base64ToBytes(atts[i].content);
      await this.bucket?.put(`sent/${sendId}/${i}`, bytes);
      meta.push({ name: atts[i].filename, type: 'application/octet-stream', size: bytes.byteLength });
    }
    return JSON.stringify(meta);
  }

  async attachment(kind: 'in' | 'out', id: string, idx: number): Promise<{ name: string; body: BodyInit } | null> {
    if (!this.bucket || !Number.isInteger(idx) || idx < 0) return null;
    if (kind === 'in') {
      const row = await this.db
        .prepare(`SELECT raw_key FROM inbound_messages WHERE id = ?`)
        .bind(id)
        .first<{ raw_key: string | null }>();
      const email = await this.loadRaw(row?.raw_key);
      const a = email?.attachments[idx];
      if (!a) return null;
      return { name: safeFilename(a.filename || 'attachment'), body: a.content as BodyInit };
    }
    const row = await this.db
      .prepare(`SELECT attachments FROM email_sends WHERE id = ?`)
      .bind(id)
      .first<{ attachments: string | null }>();
    const meta = parseMeta(row?.attachments)[idx];
    const obj = meta ? await this.bucket.get(`sent/${id}/${idx}`) : null;
    return obj && meta ? { name: meta.name, body: obj.body } : null;
  }

  private async loadBody(id: string, rawKey: string | null): Promise<{ text?: string | null; html?: string | null } | null> {
    const cached = await this.bucket?.get(`in/${id}.json`);
    if (cached) return cached.json();
    return this.loadRaw(rawKey); // mail stored before the body cache existed
  }

  private async loadRaw(key: string | null | undefined): Promise<ParsedEmail | null> {
    if (!key || !this.bucket) return null;
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return PostalMime.parse(await obj.arrayBuffer()).catch(() => null);
  }
}

function parseMeta(json: string | null | undefined): AttachmentMeta[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
