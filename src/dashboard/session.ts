import { hashApiKey, secretEqual } from '../crypto';

const COOKIE_NAME = 'eapi_sid';
const COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/dashboard';

/** Signed session token `${exp}.${HMAC(exp, secret)}` in an HttpOnly cookie. */
export async function createSessionCookie(secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hashApiKey(String(exp), secret);
  return `${COOKIE_NAME}=${exp}.${sig}; ${COOKIE_ATTRS}; Max-Age=${ttlSeconds}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; ${COOKIE_ATTRS}; Max-Age=0`;
}

export async function verifySession(cookieHeader: string | null, secret: string): Promise<boolean> {
  const token = parseCookie(cookieHeader, COOKIE_NAME);
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hashApiKey(expStr, secret);
  return secretEqual(sig, expected);
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
