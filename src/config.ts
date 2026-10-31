import type { ForwardableEmailMessage } from '@cloudflare/workers-types';

export interface Env {
  // D1
  DB: D1Database;
  // KV for hour-bucket rate limits (per-key, per-recipient)
  RATE_LIMIT: KVNamespace;
  // R2: raw inbound .eml + sent attachments (mailbox)
  MAIL?: R2Bucket;

  // Secrets
  API_KEY_PEPPER: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  ADMIN_API_SECRET?: string;
  VAPID_PRIVATE_KEY?: string; // P-256 private JWK (JSON) for Web Push; unset = push disabled

  // Vars
  EMAIL_PROVIDER_ORDER?: string; // "brevo,resend"
  NOREPLY_ADDRESS?: string;
  NOREPLY_NAME?: string;
  TEAM_ADDRESS?: string;
  TEAM_NAME?: string;
  PERSONAL_FORWARD_ADDR?: string;
  SEND_PER_RECIPIENT_PER_HOUR?: string;
  DEFAULT_KEY_LIMIT_PER_HOUR?: string;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  VERIFY_URL_ALLOWED_ORIGINS?: string; // comma list, e.g. "https://auth.alrevion.com"

  // Dashboard (personal webmail cabinet)
  DASHBOARD_LOGIN?: string; // secret — login username
  DASHBOARD_PASSWORD?: string; // secret — login password
  DASHBOARD_SENDERS?: string; // comma list of allowed "from" addresses in the cabinet
  DASHBOARD_SESSION_TTL_HOURS?: string;
  CABINET_URL?: string; // e.g. "https://mail.example.com" — where API_ONLY_HOST sends cabinet visitors
  API_ONLY_HOST?: string; // hostname that serves the API only ("/" redirects to CABINET_URL)
}

export type InboundMessage = ForwardableEmailMessage;

export class Config {
  constructor(private env: Env) {}

  get apiKeyPepper(): string {
    return this.env.API_KEY_PEPPER;
  }

  get brevoApiKey(): string | undefined {
    return this.env.BREVO_API_KEY?.trim() || undefined;
  }

  get resendApiKey(): string | undefined {
    return this.env.RESEND_API_KEY?.trim() || undefined;
  }

  get adminApiSecret(): string | undefined {
    const v = this.env.ADMIN_API_SECRET?.trim();
    return v ? v : undefined;
  }

  /** Provider attempt order. Default Brevo primary, Resend fallback. */
  get providerOrder(): Array<'brevo' | 'resend'> {
    const raw = (this.env.EMAIL_PROVIDER_ORDER || 'brevo,resend').toLowerCase();
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s === 'brevo' || s === 'resend') as Array<'brevo' | 'resend'>;
    return list.length ? list : ['brevo', 'resend'];
  }

  get noreplyAddress(): string {
    return this.env.NOREPLY_ADDRESS?.trim() || 'noreply@alrevion.com';
  }

  get noreplyName(): string {
    return this.env.NOREPLY_NAME?.trim() || 'Alrevion';
  }

  get teamAddress(): string {
    return this.env.TEAM_ADDRESS?.trim() || 'team@alrevion.com';
  }

  get teamName(): string {
    return this.env.TEAM_NAME?.trim() || 'Alrevion Team';
  }

  get personalForwardAddr(): string | undefined {
    return this.env.PERSONAL_FORWARD_ADDR?.trim() || undefined;
  }

  /** Per-recipient/hour cap (anti-abuse). 0 = disabled. NaN-safe (fail-closed to default). */
  get sendPerRecipientPerHour(): number {
    const n = parseInt(this.env.SEND_PER_RECIPIENT_PER_HOUR ?? '10', 10);
    return Number.isFinite(n) && n >= 0 ? n : 10;
  }

  /** Default per-key/hour ceiling applied when a key has no explicit send_limit_per_hour. */
  get defaultKeyLimitPerHour(): number {
    const n = parseInt(this.env.DEFAULT_KEY_LIMIT_PER_HOUR ?? '500', 10);
    return Number.isFinite(n) && n >= 0 ? n : 500;
  }

  get appName(): string {
    return this.env.APP_NAME?.trim() || 'Alrevion';
  }

  /** Allowed origins for template "verify" vars.verify_url. Empty = nothing allowed. */
  get verifyUrlAllowedOrigins(): string[] {
    const raw = this.env.VERIFY_URL_ALLOWED_ORIGINS?.trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get dashboardLogin(): string | undefined {
    return this.env.DASHBOARD_LOGIN?.trim() || undefined;
  }

  get dashboardPassword(): string | undefined {
    return this.env.DASHBOARD_PASSWORD?.trim() || undefined;
  }

  /** Session-cookie signing secret — reuses the API-key pepper (server-side secret). */
  get sessionSecret(): string {
    return this.env.API_KEY_PEPPER;
  }

  get sessionTtlSeconds(): number {
    const h = parseInt(this.env.DASHBOARD_SESSION_TTL_HOURS ?? '12', 10);
    return (Number.isFinite(h) && h > 0 ? h : 12) * 3600;
  }

  /** Sender addresses selectable in the cabinet's compose box. */
  get dashboardSenders(): string[] {
    const raw = this.env.DASHBOARD_SENDERS?.trim();
    if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
    return ['support@alrevion.com', this.teamAddress, 'eschool@alrevion.com', this.noreplyAddress];
  }

  /** Display name for a known sender address; falls back to a Title-cased local part. */
  senderNameFor(address: string): string {
    const a = address.trim().toLowerCase();
    if (a === this.noreplyAddress.toLowerCase()) return this.noreplyName;
    if (a === this.teamAddress.toLowerCase()) return this.teamName;
    const local = a.split('@')[0] || this.appName;
    const pretty = local.charAt(0).toUpperCase() + local.slice(1);
    return `${this.appName} ${pretty}`; // e.g. "Alrevion Eschool"
  }
}
