import { EmailMessage, EmailProvider, SendResult } from './types';

/** Brevo (ex-Sendinblue) transactional email. POST /v3/smtp/email, header `api-key`. */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo' as const;

  constructor(private readonly apiKey: string) {}

  async send(msg: EmailMessage): Promise<SendResult> {
    const body: Record<string, unknown> = {
      sender: { email: msg.from, name: msg.fromName },
      to: [{ email: msg.to }],
      subject: msg.subject,
    };
    if (msg.html) body.htmlContent = msg.html;
    if (msg.text) body.textContent = msg.text;
    if (msg.replyTo) body.replyTo = { email: msg.replyTo };
    if (msg.headers && Object.keys(msg.headers).length) body.headers = msg.headers;
    if (msg.attachments?.length) {
      body.attachment = msg.attachments.map((a) => ({ name: a.filename, content: a.content }));
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`brevo_send_failed: ${res.status} ${detail.slice(0, 300)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { messageId: data.messageId || '' };
  }
}
