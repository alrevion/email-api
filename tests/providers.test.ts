import { afterEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../src/config';
import { sendWithFallback, getProviders } from '../src/providers';

function cfg(order: string) {
  return new Config({
    DB: {} as any,
    RATE_LIMIT: {} as any,
    API_KEY_PEPPER: 'p',
    BREVO_API_KEY: 'brevo-key',
    RESEND_API_KEY: 'resend-key',
    EMAIL_PROVIDER_ORDER: order,
  } as any);
}

const msg = { from: 'noreply@alrevion.com', fromName: 'Alrevion', to: 'u@x.com', subject: 'S', text: 'T' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provider chain', () => {
  it('orders brevo before resend by default', () => {
    const p = getProviders(cfg('brevo,resend'));
    expect(p.map((x) => x.name)).toEqual(['brevo', 'resend']);
  });

  it('uses primary (brevo) when it succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'b1' }), { status: 201 })
    );
    const out = await sendWithFallback(cfg('brevo,resend'), msg);
    expect(out.provider).toBe('brevo');
    expect(out.fallbackUsed).toBe(false);
    expect(out.messageId).toBe('b1');
  });

  it('falls back to resend when brevo fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('brevo down', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'r1' }), { status: 200 }));
    const out = await sendWithFallback(cfg('brevo,resend'), msg);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.provider).toBe('resend');
    expect(out.fallbackUsed).toBe(true);
    expect(out.messageId).toBe('r1');
  });

  it('throws when all providers fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 500 }));
    await expect(sendWithFallback(cfg('brevo,resend'), msg)).rejects.toThrow(/all_providers_failed/);
  });

  it('throws when no provider configured', async () => {
    const noKeys = new Config({ API_KEY_PEPPER: 'p' } as any);
    await expect(sendWithFallback(noKeys, msg)).rejects.toThrow(/no_email_provider_configured/);
  });
});
