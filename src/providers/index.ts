import { Config } from '../config';
import { BrevoEmailProvider } from './brevo';
import { ResendEmailProvider } from './resend';
import { EmailMessage, EmailProvider, SendResult } from './types';

export * from './types';

/** Build the configured provider chain in priority order. Unconfigured providers are skipped. */
export function getProviders(config: Config): EmailProvider[] {
  const providers: EmailProvider[] = [];
  for (const name of config.providerOrder) {
    if (name === 'brevo' && config.brevoApiKey) {
      providers.push(new BrevoEmailProvider(config.brevoApiKey));
    } else if (name === 'resend' && config.resendApiKey) {
      providers.push(new ResendEmailProvider(config.resendApiKey));
    }
  }
  return providers;
}

export interface FallbackOutcome extends SendResult {
  provider: 'brevo' | 'resend';
  fallbackUsed: boolean;
  attempts: Array<{ provider: string; error: string }>;
}

/**
 * Try providers in order; first success wins. Records which provider delivered and
 * whether a fallback was needed. Throws if all configured providers fail (or none configured).
 */
export async function sendWithFallback(config: Config, msg: EmailMessage): Promise<FallbackOutcome> {
  const providers = getProviders(config);
  if (!providers.length) {
    throw new Error('no_email_provider_configured: set BREVO_API_KEY and/or RESEND_API_KEY');
  }

  const attempts: Array<{ provider: string; error: string }> = [];
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const result = await provider.send(msg);
      return {
        ...result,
        provider: provider.name,
        fallbackUsed: i > 0,
        attempts,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: provider.name, error });
      console.error(`[email-api] provider ${provider.name} failed:`, error);
    }
  }

  const summary = attempts.map((a) => `${a.provider}: ${a.error}`).join(' | ');
  throw new Error(`all_providers_failed: ${summary}`);
}
