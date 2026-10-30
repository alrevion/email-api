// Crypto helpers — ported from telegram-otp-api (API-key + hashing parts only).

/** Random API key: `alr_` + 32 random bytes, base64url. */
export function generateApiKey(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const binary = Array.from(randomBytes, (byte) => String.fromCharCode(byte)).join('');
  const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `alr_${token}`;
}

/** First 8 chars of the raw key, for display/lookup hints (never the secret itself). */
export function generateApiKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 8).padEnd(8, '_');
}

/** HMAC-SHA256(apiKey, pepper) → hex. Stored in D1; raw key never persisted. */
export async function hashApiKey(apiKey: string, pepper: string): Promise<string> {
  return hmacSha256(apiKey, pepper);
}

async function hmacSha256(value: string, pepper: string): Promise<string> {
  const trimmed = (pepper || '').trim();
  if (!trimmed) {
    throw new Error('PEPPER_MISSING:hmac_sha256 Configure Worker secret: API_KEY_PEPPER');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(trimmed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** UUID v4. */
export function generateUUID(): string {
  const data = new Uint8Array(16);
  crypto.getRandomValues(data);
  data[6] = (data[6] & 0x0f) | 0x40;
  data[8] = (data[8] & 0x3f) | 0x80;
  const hex = Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/** Timing-safe string compare (admin secret), SHA-256 based — ported from ai-api. */
export async function secretEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/** Loose email validation — good enough to reject obvious garbage at the boundary. */
export function isValidEmail(email: string): boolean {
  const e = (email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

/** Strip CR/LF and control chars from a mail header value (anti header-injection). */
export function sanitizeHeaderValue(value: string): string {
  return (value || '')
    .replace(/[\r\n\t]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 998); // RFC 5322 line-length sanity cap
}
