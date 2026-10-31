// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), on WebCrypto only.
// VAPID_PRIVATE_KEY is a P-256 private JWK (JSON string); its public half is what browsers subscribe with.

export interface PushSub {
  endpoint: string;
  p256dh: string; // base64url, 65-byte uncompressed P-256 point
  auth: string; // base64url, 16 bytes
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** Application server public key (raw uncompressed point, base64url) for PushManager.subscribe. */
export function vapidPublicKey(privateJwk: string): string {
  const jwk = JSON.parse(privateJwk) as JsonWebKey;
  return b64url(concat(new Uint8Array([4]), fromB64url(jwk.x!), fromB64url(jwk.y!)));
}

async function vapidAuth(endpoint: string, privateJwk: string, subject: string): Promise<string> {
  const jwk = JSON.parse(privateJwk) as JsonWebKey;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${head}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64url(new Uint8Array(sig))}, k=${vapidPublicKey(privateJwk)}`;
}

/** RFC 8291 aes128gcm body: salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext. */
export async function encryptPayload(sub: PushSub, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, as.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  new DataView(header.buffer).setUint32(16, 4096);
  header.set(salt);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

/** Sends one push. Returns the push service status (404/410 = subscription is gone). */
export async function sendPush(sub: PushSub, data: unknown, privateJwk: string, subject: string): Promise<number> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(data)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, privateJwk, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  if (!res.ok) console.error('[email-api] push failed:', res.status, (await res.text()).slice(0, 200));
  return res.status;
}

/** Notify every subscribed device about a new inbound message; prunes dead subscriptions. */
export async function notifyNewMail(db: D1Database, privateJwk: string | undefined, subject: string, id: string): Promise<void> {
  if (!privateJwk) return;
  const [m, subs, unread] = await Promise.all([
    db
      .prepare(`SELECT from_addr, from_name, to_addr, subject, snippet, thread_id, folder FROM inbound_messages WHERE id = ?`)
      .bind(id)
      .first<Record<string, string | null>>(),
    db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions`).all<PushSub>(),
    db.prepare(`SELECT COUNT(*) AS n FROM inbound_messages WHERE read_at IS NULL AND folder = 'inbox'`).first<{ n: number }>(),
  ]);
  if (!m || m.folder !== 'inbox') return;
  const data = {
    title: m.from_name || m.from_addr,
    body: [m.subject || '(без темы)', m.snippet].filter(Boolean).join('\n').slice(0, 300),
    tid: m.thread_id || id,
    to: m.to_addr,
    unread: unread?.n ?? 0,
  };
  await Promise.all(
    (subs.results || []).map(async (s) => {
      const status = await sendPush(s, data, privateJwk, subject).catch(() => 0);
      if (status === 404 || status === 410) {
        await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(s.endpoint).run();
      }
    })
  );
}
