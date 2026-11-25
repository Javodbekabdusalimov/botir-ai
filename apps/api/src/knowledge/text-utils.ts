// Pure text helpers: normalization for matching, PII redaction, linear HTML → text.

/** Errors with a message safe and useful to show to the business owner (Uzbek). */
export class SourceError extends Error {}

const APOSTROPHES = /[ʻʼ‘’`´']/g;

/** Same item written differently ("O‘zbek  Oshi" / "o'zbek oshi") → same key. */
export const normalizeName = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(APOSTROPHES, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Trim, drop control characters, collapse whitespace, cut. Non-strings → ''. */
export const cleanLine = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim().slice(0, max).trim() : '';

const EMAIL = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,4}/gu;
// 4-4-4-4 groups or 16–19 digits in a row. "100 000 200 000" price lists (3-digit groups) do not match.
const CARD = /(?<!\d)(?:[2-9]\d{3}([  -]?)\d{4}\1\d{4}\1\d{4}|\d{16,19})(?!\d)/g;
const SEP = '[ \\t\\u00a0().-]{0,3}';
const INTL_PHONE = new RegExp(`\\+\\d(?:${SEP}\\d){7,14}(?!\\d)`, 'g');
// Uzbek numbers without "+": [998] AA BBB CC DD. Operator codes keep 9-digit prices like 150000000 intact.
const UZ_PHONE = new RegExp(
  `(?<![\\d+])(?:998${SEP}|8${SEP})?\\(?(?:20|33|50|55|6\\d|7\\d|87|88|9\\d)\\)?${SEP}\\d{3}${SEP}\\d{2}${SEP}\\d{2}(?!\\d)`, 'g',
);

/** Emails, bank cards and phone numbers → placeholders. Prefers over-redacting to leaking. */
export const redactPii = (text: string): string =>
  text.normalize('NFKC').replace(EMAIL, '[email]').replace(CARD, '[karta]').replace(INTL_PHONE, '[telefon]').replace(UZ_PHONE, '[telefon]');

const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe']);
const INLINE = new Set(['a', 'b', 'i', 'em', 'strong', 'span', 'u', 'small', 'sup', 'sub', 'font', 'td', 'th']);
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
};

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, e: string) => {
    if (!e.startsWith('#')) return ENTITIES[e.toLowerCase()] ?? all;
    const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });

/** Visible text + meta description. One pass with indexOf (no backtracking regex on untrusted 2 MB input). */
export function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    const tag = html.slice(lt + 1, Math.min(gt, lt + 2000));
    const name = /^\/?([a-z0-9]{1,12})/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    i = gt + 1;
    if (SKIP.has(name) && !tag.startsWith('/')) {
      const end = lower.indexOf(`</${name}`, i);
      i = end < 0 ? html.length : end;
    } else if (name === 'meta' && /(?:name|property)=["']?(?:og:)?description/i.test(tag)) {
      out.push('\n', /content="([^"]*)"|content='([^']*)'/i.exec(tag)?.slice(1).find(Boolean) ?? '', '\n');
    } else {
      out.push(INLINE.has(name) ? ' ' : '\n');
    }
  }
  return decodeEntities(out.join('')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** "45.000", "45,000", "45 000", "45000" → 45000. Not a price → null. */
export function parseSom(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\s ]/g, '').replace(/so'?m|сум|uzs/gi, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** Every number written in a quote, thousands separators understood ("Osh 45.000" → [45000]). */
export function somInText(text: string): number[] {
  return (text.match(/\d{1,3}(?:[ ., ]\d{3})+|\d+/g) ?? []).map((t) => parseSom(t)).filter((n): n is number => n !== null);
}
