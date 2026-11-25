// LLM output is untrusted: every field is checked and clamped here before it can become a draft fact.
import type { KnowledgeFactKind } from '@botir/shared';
import { cleanLine, normalizeName, parseSom, redactPii, somInText } from './text-utils';

export interface DraftFact {
  kind: KnowledgeFactKind;
  topic: string;
  question: string | null;
  content: string;
  price: number | null;
  unit: string | null;
  evidence: string | null;
  confidence: number;
}

export const FACT_KINDS: readonly KnowledgeFactKind[] = ['profile', 'policy', 'faq', 'catalog', 'style'];
export const LIMITS = { topic: 80, question: 300, content: 1000, unit: 30, evidence: 200, facts: 200 } as const;
const MAX_PRICE = 2_000_000_000; // fits the SQLite/Prisma Int column
const UNGROUNDED_CONFIDENCE = 0.3;

export const isValidPrice = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PRICE;

export type ComparableFact = Pick<DraftFact, 'kind' | 'topic' | 'question' | 'content' | 'price' | 'evidence'>;

/** Equal key = same fact. A changed price / answer gives a new key on purpose: it is a correction, not a duplicate. */
export function factKey(f: ComparableFact): string {
  if (f.kind === 'catalog') return `catalog|${normalizeName(f.topic)}|${f.price}`;
  const words = [...new Set(normalizeName(f.content).split(' '))].sort().join(' ');
  return f.kind === 'faq' ? `faq|${normalizeName(f.question ?? '')}|${words}` : `${f.kind}|${words}`;
}

/** Same quote, kind, topic (or price): a re-uploaded source the LLM worded differently. */
function quoteKey(f: ComparableFact): string {
  const about = f.kind === 'catalog' ? f.price : f.kind === 'faq' ? normalizeName(f.question ?? '') : f.topic;
  return f.evidence ? `quote|${f.kind}|${about}|${normalizeName(f.evidence)}` : '';
}

/** Facts the business does not have yet (existing = non-rejected). */
export function dropKnown(facts: DraftFact[], existing: ComparableFact[]): DraftFact[] {
  const known = new Set(existing.flatMap((f) => [factKey(f), quoteKey(f)]).filter(Boolean));
  return facts.filter((f) => !known.has(factKey(f)) && !known.has(quoteKey(f)));
}

/**
 * LLM narxi: matn ("45.000") ham qabul qilinadi; "45.000" dan 45 chiqqan bo'lsa (nuqta kasr deb o'qilgan),
 * iqtibosdagi 45 000 ga to'g'irlanadi.
 */
export function catalogPrice(raw: unknown, evidence: string): number | null {
  const n = parseSom(raw);
  if (n === null || !isValidPrice(n)) return null;
  const quoted = somInText(evidence);
  if (n > 0 && n < 1000 && !quoted.includes(n) && quoted.includes(n * 1000)) return n * 1000;
  return n;
}

function toFact(raw: unknown, grounding?: string): DraftFact | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = FACT_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const topic = cleanLine(r.topic, LIMITS.topic);
  const question = kind === 'faq' ? cleanLine(r.question, LIMITS.question) : '';
  const price = kind === 'catalog' ? catalogPrice(r.price, cleanLine(r.evidence, 400)) : null;
  if (!topic || (kind === 'faq' && !question) || (kind === 'catalog' && price === null)) return null;
  const content = cleanLine(r.content, LIMITS.content) || (kind === 'catalog' ? topic : '');
  if (!content) return null;

  // A quote that is not in the source is not evidence, and the fact is shown to the owner as low-confidence.
  const quote = cleanLine(r.evidence, 400);
  const grounded = grounding === undefined || (quote !== '' && grounding.includes(normalizeName(quote)));
  const rawConfidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0.5;
  const confidence = Math.min(1, Math.max(0, rawConfidence));
  return {
    kind,
    topic: kind === 'catalog' ? topic : topic.toLowerCase(),
    question: question || null,
    content,
    price,
    unit: kind === 'catalog' ? cleanLine(r.unit, LIMITS.unit) || null : null,
    evidence: (grounded && redactPii(quote).slice(0, LIMITS.evidence)) || null,
    confidence: grounded ? confidence : Math.min(confidence, UNGROUNDED_CONFIDENCE),
  };
}

/** Valid facts without repeats. `groundingText` (text sources) = the words a quote must come from. */
export function validateFacts(raw: unknown, groundingText?: string): DraftFact[] {
  const list: unknown = typeof raw === 'object' && raw !== null ? (raw as { facts?: unknown }).facts : undefined;
  if (!Array.isArray(list)) return [];
  const grounding = groundingText === undefined ? undefined : normalizeName(groundingText);
  const seen = new Set<string>();
  const out: DraftFact[] = [];
  for (const item of list) {
    if (out.length >= LIMITS.facts) break;
    const fact = toFact(item, grounding);
    if (!fact) continue;
    const key = factKey(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}
