// LLM output is untrusted: every field is checked and clamped here before it can become a draft fact.
import type { KnowledgeFactKind } from '@botir/shared';
import { cleanLine, MAX_SOM, normalizeName, redactPii, somAmounts } from './text-utils';

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
const UNGROUNDED_CONFIDENCE = 0.3;

export const isValidPrice = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SOM;

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

/** "Cola 1.5 l" is sold per bottle: a size already in the name is not the selling unit (null → catalog default "dona"). */
function sellingUnit(topic: string, unit: string): string | null {
  const u = normalizeName(unit);
  return !u || new RegExp(`\\d ?${u}(?!\\p{L})`, 'u').test(normalizeName(topic)) ? null : unit;
}

function toFact(raw: unknown, grounding?: string): DraftFact | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = FACT_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const topic = cleanLine(r.topic, LIMITS.topic);
  const question = kind === 'faq' ? cleanLine(r.question, LIMITS.question) : '';
  const price = kind === 'catalog' && isValidPrice(r.price) ? r.price : null;
  if (!topic || (kind === 'faq' && !question) || (kind === 'catalog' && price === null)) return null;
  const content = cleanLine(r.content, LIMITS.content) || (kind === 'catalog' ? topic : '');
  if (!content) return null;

  // A quote that is not in the source is not evidence, and the fact is shown to the owner as low-confidence.
  const quote = cleanLine(r.evidence, 400);
  const grounded = grounding === undefined || (quote !== '' && grounding.includes(normalizeName(quote)));
  // "Osh 45 000" with price 4500: the quote is real, the number is not. Kept visible so the owner sees the mismatch.
  const priceInQuote = price === null || quote === '' || somAmounts(quote).has(price);
  const rawConfidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0.5;
  const confidence = Math.min(1, Math.max(0, rawConfidence));
  return {
    kind,
    topic: kind === 'catalog' ? topic : topic.toLowerCase(),
    question: question || null,
    content,
    price,
    unit: kind === 'catalog' ? sellingUnit(topic, cleanLine(r.unit, LIMITS.unit)) : null,
    evidence: (grounded && redactPii(quote).slice(0, LIMITS.evidence)) || null,
    confidence: grounded && priceInQuote ? confidence : Math.min(confidence, UNGROUNDED_CONFIDENCE),
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
