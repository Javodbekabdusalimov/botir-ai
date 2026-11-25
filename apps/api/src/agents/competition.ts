// Deterministic winner selection among parallel negotiations of one task. No LLM involved.
import { checkClientConditions } from './personal-agent';
import type { Offer } from './shared';
import type { AgentBusiness, Product, UserTask } from './types';

export interface Contender {
  business: AgentBusiness;
  offer: Offer;
  /** Catalog of the business, needed to match the requested items by name. */
  products?: Product[];
}

/**
 * Only a complete offer can win: real money (total > 0), every item the client named with its qty (and the budget).
 * "6 kishilik osh" without explicit counts → the main line must cover the people (6 portions, not 1);
 * explicit counts ("8 kishilik stol, 2 ta salat") are checked per item instead.
 */
export function isComplete(c: Contender, task: UserTask): boolean {
  if (c.offer.total <= 0) return false;
  const people = task.people;
  const counted = !!task.items?.length && task.items.every((it) => it.qty);
  if (people && !counted && !c.offer.items.some((it) => it.qty >= people)) return false;
  return checkClientConditions(task, c.offer, c.products ?? []) === null;
}

/** Lowest agreed total first; ties → higher discount, then input order (stable sort). */
export function rankContenders(list: Contender[]): Contender[] {
  return [...list].sort((a, b) => a.offer.total - b.offer.total || b.offer.discountPct - a.offer.discountPct);
}

/** Human-readable reason for the winner, e.g. "3 ta joydan 2 tasi to'liq taklif berdi → eng arzon". */
export function winnerReason(ranked: Contender[], lang: 'uz' | 'ru', asked = ranked.length): string {
  if (ranked.length === 0) return '';
  return lang === 'ru'
    ? `Из ${asked} заведений полное предложение дали ${ranked.length} → самая низкая цена`
    : `${asked} ta joydan ${ranked.length} tasi to'liq taklif berdi → eng arzon`;
}
