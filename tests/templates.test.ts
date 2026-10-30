import { describe, expect, it } from 'vitest';

import { renderTemplate } from '../src/templates';

describe('templates', () => {
  it('renders otp with code', () => {
    const r = renderTemplate('otp', { code: '123456', ttl_minutes: 5, app_name: 'Alrevion' });
    expect(r.subject).toContain('Alrevion');
    expect(r.text).toContain('123456');
    expect(r.html).toContain('123456');
  });

  it('renders reset with code', () => {
    const r = renderTemplate('reset', { code: '999000' });
    expect(r.text).toContain('999000');
  });

  it('renders verify with url', () => {
    const r = renderTemplate('verify', { verify_url: 'https://x/y' });
    expect(r.html).toContain('https://x/y');
  });

  it('throws on missing required var', () => {
    expect(() => renderTemplate('otp', {})).toThrow(/template_vars_missing/);
    expect(() => renderTemplate('verify', {})).toThrow(/template_vars_missing/);
  });

  it('throws on unknown template', () => {
    expect(() => renderTemplate('nope', {})).toThrow(/unknown_template/);
  });
});
