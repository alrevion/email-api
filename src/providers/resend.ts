import { EmailMessage, EmailProvider, SendResult } from './types';

/** Resend fallback. POST /emails, Bearer key. Same as auth-api's existing integration. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;

  constructor(private readonly apiKey: string) {}

  async send(msg: EmailMessage): Promise<SendResult> {
    // Quoted display-name form (RFC 5322 mailbox) — avoids the name leaking into the address part.
    const from = msg.fromName ? `"${msg.fromName}" <${msg.from}>` : msg.from;
    const body: Record<string, unknown> = {
      from,
      to: [msg.to],
      subject: msg.subject,
    };
    if (msg.html) body.html = msg.html;
    if (msg.text) body.text = msg.text;
    if (msg.replyTo) body.reply_to = msg.replyTo;
    if (msg.headers && Object.keys(msg.headers).length) body.headers = msg.headers;
    if (msg.attachments?.length) {
      body.attachments = msg.attachments.map((a) => ({ filename: a.filename, content: a.content }));
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`resend_send_failed: ${res.status} ${detail.slice(0, 300)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { messageId: data.id || '' };
  }
}
