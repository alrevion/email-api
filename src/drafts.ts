/** Dashboard drafts (D1 table `drafts`): the compose modal autosaves here; a successful send deletes it. */
export interface Draft {
  id: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  body: string;
  quote: string;
  inbound_id: string | null;
  fwd_kind: 'in' | 'out' | null;
  fwd_id: string | null;
  updated_at?: string;
}

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const cut = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates client input; null when the id is malformed. */
export function cleanDraft(id: string, input: Record<string, unknown> | null): Draft | null {
  if (!ID_RE.test(id) || !input) return null;
  const kind = input.fwd_kind === 'in' || input.fwd_kind === 'out' ? input.fwd_kind : null;
  const ref = (v: unknown) => (typeof v === 'string' && ID_RE.test(v) ? v : null);
  return {
    id,
    from_addr: cut(input.from, 320),
    to_addr: cut(input.to, 320),
    subject: cut(input.subject, 500),
    body: cut(input.text, 200_000),
    quote: cut(input.quote, 200_000),
    inbound_id: ref(input.inbound_id),
    fwd_kind: kind,
    fwd_id: kind ? ref(input.fwd_id) : null,
  };
}

export class Drafts {
  constructor(private db: D1Database) {}

  async list(): Promise<Draft[]> {
    const res = await this.db.prepare(`SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 200`).all<Draft>();
    return res.results || [];
  }

  async count(): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS n FROM drafts`).first<{ n: number }>();
    return row?.n || 0;
  }

  async save(d: Draft): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO drafts (id, from_addr, to_addr, subject, body, quote, inbound_id, fwd_kind, fwd_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET from_addr = excluded.from_addr, to_addr = excluded.to_addr,
           subject = excluded.subject, body = excluded.body, quote = excluded.quote, inbound_id = excluded.inbound_id,
           fwd_kind = excluded.fwd_kind, fwd_id = excluded.fwd_id, updated_at = excluded.updated_at`,
      )
      .bind(d.id, d.from_addr, d.to_addr, d.subject, d.body, d.quote, d.inbound_id, d.fwd_kind, d.fwd_id)
      .run();
  }

  async remove(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM drafts WHERE id = ?`).bind(id).run();
  }
}
