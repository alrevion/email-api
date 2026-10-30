export interface EmailMessage {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  /** Extra raw headers, e.g. In-Reply-To / References for threading. */
  headers?: Record<string, string>;
  attachments?: OutgoingAttachment[];
}

export interface OutgoingAttachment {
  filename: string;
  /** base64 */
  content: string;
}

export interface SendResult {
  messageId: string;
}

export interface EmailProvider {
  readonly name: 'brevo' | 'resend';
  send(msg: EmailMessage): Promise<SendResult>;
}
