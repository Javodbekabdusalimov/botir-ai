// Deterministic winner selection among parallel negotiations of one task. No LLM involved.
import type { Offer } from './shared';
import type { AgentBusiness } from './types';

export interface Contender {
  business: AgentBusiness;
  offer: Offer;
}

/** Lowest agreed total first; ties → higher discount, then input order (stable sort). */
export function rankContenders(list: Contender[]): Contender[] {
  return [...list].sort((a, b) => a.offer.total - b.offer.total || b.offer.discountPct - a.offer.discountPct);
}

/** Human-readable reason for the winner, e.g. "3 ta joy raqobatlashdi → eng arzon". */
export function winnerReason(ranked: Contender[], lang: 'uz' | 'ru'): string {
  if (ranked.length === 0) return '';
  return lang === 'ru'
    ? `${ranked.length} ресторана соревновались → самая низкая цена`
    : `${ranked.length} ta joy raqobatlashdi → eng arzon`;
}
