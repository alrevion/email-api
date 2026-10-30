// Bilingual (RU + EN) transactional templates. Tone mirrors auth-api sendPasswordUnlockEmail.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type TemplateName = 'otp' | 'reset' | 'verify';

interface CodeVars {
  code: string;
  ttl_minutes?: number;
  app_name?: string;
}

interface VerifyVars {
  verify_url?: string;
  code?: string;
  app_name?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function codeBlockHtml(brand: string, heading: string, code: string, hint: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #ececf1">
    <div style="font-weight:600;font-size:15px;color:#111">${escapeHtml(brand)}</div>
    <p style="color:#333;font-size:15px;margin:16px 0 8px">${escapeHtml(heading)}</p>
    <div style="font-size:30px;font-weight:700;letter-spacing:6px;color:#111;background:#f2f3f7;border-radius:8px;padding:16px;text-align:center;margin:12px 0">${escapeHtml(code)}</div>
    <p style="color:#888;font-size:13px;margin-top:16px">${escapeHtml(hint)}</p>
  </div></body></html>`;
}

function linkBlockHtml(brand: string, heading: string, url: string, hint: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #ececf1">
    <div style="font-weight:600;font-size:15px;color:#111">${escapeHtml(brand)}</div>
    <p style="color:#333;font-size:15px;margin:16px 0 8px">${escapeHtml(heading)}</p>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:8px;padding:12px 20px;margin:12px 0;font-size:14px">Подтвердить / Confirm</a>
    <p style="color:#888;font-size:13px;margin-top:16px;word-break:break-all">${escapeHtml(url)}</p>
    <p style="color:#888;font-size:13px;margin-top:8px">${escapeHtml(hint)}</p>
  </div></body></html>`;
}

export function otpEmail(vars: CodeVars): RenderedEmail {
  const brand = (vars.app_name || 'Alrevion').trim();
  const ttl = vars.ttl_minutes ?? 10;
  return {
    subject: `${brand}: код входа / login code`,
    text:
      `Ваш код входа: ${vars.code}\nКод действует ${ttl} минут. Если вы не запрашивали вход — проигнорируйте письмо.\n\n` +
      `Your login code: ${vars.code}\nThe code is valid for ${ttl} minutes. If you did not request it, ignore this email.`,
    html: codeBlockHtml(
      brand,
      `Ваш код входа / your login code (${ttl} мин):`,
      vars.code,
      'Если вы не запрашивали вход — проигнорируйте письмо. / If you did not request this, ignore this email.'
    ),
  };
}

export function resetEmail(vars: CodeVars): RenderedEmail {
  const brand = (vars.app_name || 'Alrevion').trim();
  const ttl = vars.ttl_minutes ?? 10;
  return {
    subject: `${brand}: код сброса пароля / password reset code`,
    text:
      `Ваш код сброса пароля: ${vars.code}\nКод действует ${ttl} минут. Если вы не запрашивали сброс — проигнорируйте письмо.\n\n` +
      `Your password reset code: ${vars.code}\nThe code is valid for ${ttl} minutes. If you did not request this, ignore this email.`,
    html: codeBlockHtml(
      brand,
      `Код сброса пароля / password reset code (${ttl} мин):`,
      vars.code,
      'Если вы не запрашивали сброс — проигнорируйте письмо. / If you did not request this, ignore this email.'
    ),
  };
}

export function verifyEmail(vars: VerifyVars): RenderedEmail {
  const brand = (vars.app_name || 'Alrevion').trim();
  if (vars.verify_url) {
    return {
      subject: `${brand}: подтвердите email / verify your email`,
      text:
        `Подтвердите ваш email, перейдя по ссылке:\n${vars.verify_url}\n\n` +
        `Verify your email by opening this link:\n${vars.verify_url}`,
      html: linkBlockHtml(
        brand,
        'Подтвердите ваш email / verify your email:',
        vars.verify_url,
        'Ссылка одноразовая. / This link is single-use.'
      ),
    };
  }
  const code = vars.code || '';
  return {
    subject: `${brand}: код подтверждения / verification code`,
    text:
      `Ваш код подтверждения: ${code}\n\nYour verification code: ${code}`,
    html: codeBlockHtml(brand, 'Код подтверждения / verification code:', code, ''),
  };
}

/** Render a known template by name. Throws on missing required vars. */
export function renderTemplate(name: string, vars: Record<string, unknown>): RenderedEmail {
  switch (name) {
    case 'otp':
      requireVar(vars, 'code');
      return otpEmail(vars as unknown as CodeVars);
    case 'reset':
      requireVar(vars, 'code');
      return resetEmail(vars as unknown as CodeVars);
    case 'verify':
      if (!vars.verify_url && !vars.code) {
        throw new Error('template_vars_missing: verify requires verify_url or code');
      }
      return verifyEmail(vars as unknown as VerifyVars);
    default:
      throw new Error(`unknown_template: ${name}`);
  }
}

function requireVar(vars: Record<string, unknown>, key: string): void {
  if (vars[key] === undefined || vars[key] === null || vars[key] === '') {
    throw new Error(`template_vars_missing: ${key}`);
  }
}
