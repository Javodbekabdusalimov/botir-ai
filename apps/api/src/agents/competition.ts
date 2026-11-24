// Deterministic winner selection among parallel negotiations of one task. No LLM involved.
import type { Offer } from './shared';
import type { AgentBusiness } from './types';

export const SCORE_WEIGHTS = { price: 0.6, rating: 0.25, distance: 0.15 } as const;

export interface Contender {
  business: AgentBusiness;
  offer: Offer;
}

export interface RankedContender extends Contender {
  rating: number;
  distanceKm: number;
  score: number; // 0..1
}

const DEFAULT_RATING = 4.5;
const DEFAULT_DISTANCE_KM = 3;

/** Min-max normalised to 0..1 (1 = best among contenders); all equal → 1. */
const norm = (v: number, min: number, max: number, higherIsBetter: boolean): number =>
  max === min ? 1 : higherIsBetter ? (v - min) / (max - min) : (max - v) / (max - min);

/** Score = 0.6·price + 0.25·rating + 0.15·distance (each min-max normalised). Best first; ties → lower price. */
export function rankContenders(list: Contender[]): RankedContender[] {
  if (list.length === 0) return [];
  const rows = list.map((c) => ({
    ...c,
    rating: c.business.rating ?? DEFAULT_RATING,
    distanceKm: Math.max(0.1, c.business.distanceKm ?? DEFAULT_DISTANCE_KM),
  }));
  const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
  const [pMin, pMax] = range(rows.map((r) => r.offer.total));
  const [rMin, rMax] = range(rows.map((r) => r.rating));
  const [dMin, dMax] = range(rows.map((r) => r.distanceKm));
  return rows
    .map((r) => {
      const score =
        SCORE_WEIGHTS.price * norm(r.offer.total, pMin, pMax, false) +
        SCORE_WEIGHTS.rating * norm(r.rating, rMin, rMax, true) +
        SCORE_WEIGHTS.distance * norm(r.distanceKm, dMin, dMax, false);
      return { ...r, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || a.offer.total - b.offer.total);
}

/** Human-readable reason for the winner, e.g. "eng arzon + reyting 4.8". */
export function winnerReason(ranked: RankedContender[], lang: 'uz' | 'ru'): string {
  const w = ranked[0];
  if (!w) return '';
  const ru = lang === 'ru';
  const parts: string[] = [];
  if (ranked.every((r) => w.offer.total <= r.offer.total)) parts.push(ru ? 'самая низкая цена' : 'eng arzon');
  if (ranked.every((r) => w.rating >= r.rating)) parts.push(ru ? `рейтинг ${w.rating}` : `reyting ${w.rating}`);
  if (ranked.every((r) => w.distanceKm <= r.distanceKm)) parts.push(ru ? `ближе всех (${w.distanceKm} км)` : `eng yaqin (${w.distanceKm} km)`);
  if (parts.length === 0) parts.push(ru ? `лучший баланс цены и рейтинга ${w.rating}` : `narx va reyting ${w.rating} bo'yicha eng yaxshi muvozanat`);
  return `${ranked.length} ${ru ? 'ресторана соревновались' : "ta joy raqobatlashdi"} → ${parts.join(' + ')}`;
}
