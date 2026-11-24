// PolicyGuard — sync, no LLM. Prices/discounts are NEVER trusted from the LLM.
import type { AgentStore } from './store/agent-store';
import type { AgentBusiness, BusinessHours, GuardResult, Product } from './types';

export const MAX_ROUNDS = 3;
const TG_RATE_PER_MIN = 20;
const TZ = 'Asia/Tashkent';

export interface OfferDraft {
  items: { productId: string; qty: number }[];
  discountPct: number;
}

export interface OfferCheckInput {
  business: AgentBusiness;
  products: Product[];
  draft: OfferDraft;
  total: number;
  round: number;
}

export interface TgCheckInput {
  accountId: string;
  peerKnown: boolean; // peer wrote to us before
  isFirstMessage: boolean;
  mode: 'copilot' | 'command' | 'autopilot' | 'off';
  hours: BusinessHours;
  now?: Date;
}

/** Catalog price × qty × (1 − discount), rounded to whole so'm. The only place totals are computed. */
export function computeTotal(products: Product[], draft: OfferDraft): number {
  const byId = new Map(products.map((p) => [p.id, p]));
  const gross = draft.items.reduce((sum, it) => sum + (byId.get(it.productId)?.price ?? 0) * it.qty, 0);
  return Math.round(gross * (1 - draft.discountPct / 100));
}

/** Tashkent local "HH:MM" for a Date. */
export function tashkentTime(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function withinHours(hours: BusinessHours, hhmm: string): boolean {
  return hhmm >= hours.open && hhmm < hours.close;
}

export class PolicyGuard {
  private readonly sent = new Map<string, number[]>(); // accountId → timestamps (ms)

  constructor(private readonly store: AgentStore) {}

  checkOffer(input: OfferCheckInput): GuardResult {
    const { business, products, draft, total, round } = input;
    if (round > MAX_ROUNDS) return { ok: false, reason: `round ${round} > ${MAX_ROUNDS}` };
    if (draft.items.length === 0) return { ok: false, reason: 'empty offer' };
    const ids = new Set(products.map((p) => p.id));
    const unknown = draft.items.find((it) => !ids.has(it.productId));
    if (unknown) return { ok: false, reason: `product not in catalog: ${unknown.productId}` };
    const badQty = draft.items.find((it) => !Number.isInteger(it.qty) || it.qty <= 0);
    if (badQty) return { ok: false, reason: `bad qty for ${badQty.productId}: ${badQty.qty}` };
    if (draft.discountPct < 0 || draft.discountPct > business.maxDiscountPct) {
      return { ok: false, reason: `discount ${draft.discountPct}% > max ${business.maxDiscountPct}%` };
    }
    const expected = computeTotal(products, draft);
    if (total !== expected) return { ok: false, reason: `total ${total} != catalog total ${expected}` };
    return { ok: true };
  }

  /** Fixes a draft so it passes: drops unknown products, fixes qty, clamps discount. */
  repairOffer(business: AgentBusiness, products: Product[], draft: OfferDraft): OfferDraft {
    const ids = new Set(products.map((p) => p.id));
    const merged = new Map<string, number>();
    for (const it of draft.items) {
      if (!ids.has(it.productId)) continue;
      const qty = Math.max(1, Math.round(Number(it.qty) || 1));
      merged.set(it.productId, (merged.get(it.productId) ?? 0) + qty);
    }
    const discountPct = Math.min(Math.max(Number(draft.discountPct) || 0, 0), business.maxDiscountPct);
    return { items: [...merged].map(([productId, qty]) => ({ productId, qty })), discountPct };
  }

  checkTelegram(input: TgCheckInput): GuardResult {
    const now = input.now ?? new Date();
    if (input.mode === 'off') return { ok: false, reason: 'channel is off' };
    if (input.isFirstMessage && !input.peerKnown) return { ok: false, reason: 'first message to unknown peer is forbidden' };
    if (input.mode === 'autopilot' && !withinHours(input.hours, tashkentTime(now))) {
      return { ok: false, reason: 'autopilot outside business hours' };
    }
    const windowStart = now.getTime() - 60_000;
    const recent = (this.sent.get(input.accountId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= TG_RATE_PER_MIN) {
      this.sent.set(input.accountId, recent);
      return { ok: false, reason: `rate limit ${TG_RATE_PER_MIN}/min exceeded` };
    }
    recent.push(now.getTime());
    this.sent.set(input.accountId, recent);
    return { ok: true };
  }

  async record(
    scope: 'offer' | 'telegram',
    result: GuardResult,
    meta: { sessionId?: string; businessId?: string; repaired: boolean },
  ): Promise<void> {
    if (result.ok) return;
    await this.store.savePolicyViolation({ scope, reason: result.reason, ...meta, at: new Date().toISOString() });
  }
}
