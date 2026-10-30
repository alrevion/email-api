import { describe, expect, it } from 'vitest';

import { messageIdVariants, normalizeSubject, textPreview, base64ToBytes, referencesHeader, mergeBoxes } from '../src/mailbox';
import { DASHBOARD_HTML } from '../src/dashboard/ui';
import { cleanDraft } from '../src/drafts';

describe('mailbox helpers', () => {
  it('normalizes reply/forward subject prefixes', () => {
    expect(normalizeSubject('Re: RE: Fwd: Вопрос по оплате ')).toBe('вопрос по оплате');
    expect(normalizeSubject('Ответ: Help')).toBe('help');
    expect(normalizeSubject('Re[2]: Help')).toBe('help');
    expect(normalizeSubject(null)).toBe('');
  });

  it('expands message-id headers with and without brackets', () => {
    const v = messageIdVariants('<a@x> <b@y>', 'c@z');
    expect(v).toEqual(expect.arrayContaining(['<a@x>', 'a@x', '<b@y>', 'b@y', '<c@z>', 'c@z']));
    expect(messageIdVariants(undefined, '')).toEqual([]);
  });

  it('builds a text preview from html when text is missing', () => {
    expect(textPreview(null, '<style>p{}</style><p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('keeps the newest message-ids in References', () => {
    const refs = Array.from({ length: 30 }, (_, i) => `<id${i}@x>`).join(' ');
    const out = referencesHeader(refs, '<parent@x>').split(' ');
    expect(out).toHaveLength(10);
    expect(out[out.length - 1]).toBe('<parent@x>');
    expect(referencesHeader(null, '<p@x>')).toBe('<p@x>');
  });

  it('appends addresses that received mail after the configured senders, case-insensitively deduped', () => {
    expect(mergeBoxes(['team@a.com', 'Support@a.com'], ['support@a.com', 'hello@a.com']))
      .toEqual(['team@a.com', 'Support@a.com', 'hello@a.com']);
  });

  it('decodes base64 to bytes', () => {
    expect(Array.from(base64ToBytes('AAEC/w=='))).toEqual([0, 1, 2, 255]);
  });
});

describe('dashboard SPA', () => {
  it('ships syntactically valid client JS', () => {
    const js = DASHBOARD_HTML.split('<script>')[1].split('</script>')[0];
    expect(() => new Function(js)).not.toThrow();
  });

  it('folds the quoted history of a plain-text reply, attribution included', () => {
    const js = DASHBOARD_HTML.split('<script>')[1].split('</script>')[0];
    const src = js.match(/function splitQuote\(t\)\{[\s\S]*?return \[t,""\];\}/)![0];
    const splitQuote = new Function(`${src}; return splitQuote;`)() as (t: string) => [string, string];
    const [main, quoted] = splitQuote('Thanks!\n\nOn Wed, Oct 28, 2026 at 3:49 AM Alrevion Team <\nteam@alrevion.com> wrote:\n> Hi\n> there');
    expect(main).toBe('Thanks!');
    expect(quoted.startsWith('On Wed')).toBe(true);
    expect(splitQuote('No quote here')).toEqual(['No quote here', '']);
    expect(splitQuote('> only a quote')).toEqual(['> only a quote', '']);
  });
});

describe('drafts', () => {
  it('validates ids and clamps fields', () => {
    expect(cleanDraft('bad id!', { text: 'x' })).toBeNull();
    expect(cleanDraft('abc', { text: 'x' })).toBeNull();
    const d = cleanDraft('1730000000000-abcd1234', {
      from: 'team@alrevion.com', to: 'a@b.co', subject: 's'.repeat(900), text: 'hi', quote: '> q',
      inbound_id: 'not valid!', fwd_kind: 'in', fwd_id: 'msg-12345678',
    })!;
    expect(d.subject).toHaveLength(500);
    expect(d.inbound_id).toBeNull();
    expect([d.fwd_kind, d.fwd_id]).toEqual(['in', 'msg-12345678']);
    expect(cleanDraft('1730000000000-abcd1234', { fwd_kind: 'evil', fwd_id: 'msg-12345678' })!.fwd_id).toBeNull();
  });
});
