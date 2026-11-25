// Pure text helpers: normalization for matching, PII redaction, linear HTML → text.

/** Errors with a message safe and useful to show to the business owner (Uzbek). */
export class SourceError extends Error {}

const APOSTROPHES = /[ʻʼ‘’`´']/g;

/** Same item written differently ("O‘zbek  Oshi" / "o'zbek oshi") → same key. */
export const normalizeName = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(APOSTROPHES, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Uzbek suffixes that do not change the item: go'sht-i, go'sht-li, choy-lar. "-siz" (without) is NOT here on purpose.
const SUFFIX = /(?:lari|lar|li|si|i)$/;
const nameWords = (s: string): string[] =>
  normalizeName(s).replace(/(\d)(?=\p{L})|(\p{L})(?=\d)/gu, '$1$2 ').split(' ').filter(Boolean)
    .map((w) => (/^\d+$/.test(w) || w.length < 5 ? w : w.replace(SUFFIX, '')));

/**
 * Same item written differently: word order, brackets, "1.5L" / "1,5 l", "go'shtli" / "go'shti".
 * Same words only: "Lavash kichik" vs "Lavash tovuq kichik" is a different product, so an extra word never matches.
 */
export function sameItemName(a: string, b: string): boolean {
  const [x, y] = [nameWords(a), nameWords(b)];
  const digits = (w: string[]) => w.filter((t) => /^\d+$/.test(t)).join(' '); // in order: "0.5 l" ≠ "5.0 l"
  return x.length > 0 && digits(x) === digits(y) && x.slice().sort().join(' ') === y.slice().sort().join(' ');
}

export const MAX_SOM = 2_000_000_000; // fits the SQLite/Prisma Int column
const MULTIPLIERS: Record<string, number> = { ming: 1e3, k: 1e3, 'тыс': 1e3, mln: 1e6, million: 1e6, 'млн': 1e6 };
// "45 000" | "45.000" | "1,250,000" (3-digit groups) or plain digits, then optional decimals, multiplier and currency word.
const SOM = /^(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,](\d+))?(?: ?(ming|k|тыс|mln|million|млн)\.?)?(?: ?(?:so'?m|sum|сум|uzs)\.?)?$/u;

/** Owner-typed price → whole so'm: "45.000", "45 000", "45,000 so'm", "45 ming", "1,5 mln". Anything else → null. */
export function parseSom(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= MAX_SOM ? v : null;
  if (typeof v !== 'string') return null;
  const m = SOM.exec(v.normalize('NFKC').toLowerCase().replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim());
  if (!m) return null;
  const [, int = '', frac = '', unit] = m;
  if (frac && !unit && /[^0]/.test(frac)) return null; // "45.5 so'm" is not a price, "45.5 ming" is
  const value = Math.round(Number(`${int.replace(/[ .,]/g, '')}.${frac || '0'}`) * (unit ? (MULTIPLIERS[unit] ?? 1) : 1));
  return value <= MAX_SOM ? value : null;
}

/** Every number written in a quote, read whole ("Osh 45.000" → [45000], never 45). */
export function somInText(text: string): number[] {
  return (text.match(/\d{1,3}(?:[ .,\u00a0]\d{3})+|\d+/g) ?? []).map((t) => parseSom(t)).filter((n): n is number => n !== null);
}

const AMOUNT = /(\d+(?:[ .,]\d+)*)(?: ?(ming|k|тыс|mln|million|млн)(?!\p{L}))?/gu;

/** Every amount a quote can mean. "100 000 200 000" → 100000 and 200000 too, "000" alone never starts one. */
export function somAmounts(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').matchAll(AMOUNT)) {
    const groups = (m[1] ?? '').split(/[ .,]/);
    const mult = m[2] ? (MULTIPLIERS[m[2]] ?? 0) : 0;
    groups.forEach((first, i) => {
      if (i > 0 && /^0\d/.test(first)) return;
      for (let j = i; j < groups.length; j++) {
        if (j > i && (first.length > 3 || groups[j]?.length !== 3)) break;
        const n = Number(groups.slice(i, j + 1).join(''));
        out.add(n);
        if (mult && j === groups.length - 1) out.add(n * mult);
      }
    });
    if (mult && groups.length >= 2) out.add(Math.round(Number(`${groups.at(-2)}.${groups.at(-1)}`) * mult)); // "1,5 mln"
  }
  return out;
}

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
