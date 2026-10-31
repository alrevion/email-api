import { describe, expect, it } from 'vitest';

import { b64url, encryptPayload, fromB64url, vapidPublicKey } from '../src/push';

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) =>
  new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
      len * 8
    )
  );

describe('web push', () => {
  it('encrypts a payload the browser side can decrypt (RFC 8291)', async () => {
    // Browser (user agent) side of a subscription.
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));

    const body = await encryptPayload({ endpoint: 'https://x', p256dh: b64url(uaPublic), auth: b64url(auth) }, new TextEncoder().encode('{"title":"Привет"}'));

    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    const asPublic = body.slice(21, 21 + body[20]);
    const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as any, ua.privateKey, 256));
    const enc = new TextEncoder();
    const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
        body.slice(21 + body[20])
      )
    );
    expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"title":"Привет"}');
  });

  it('derives the VAPID public key from the private JWK', async () => {
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
    const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    const raw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
    expect(fromB64url(vapidPublicKey(jwk))).toEqual(raw);
  });
});
