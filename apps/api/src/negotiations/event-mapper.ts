// Maps agent-layer events (role/text, separate 'offer' event) to the shared NegotiationEvent of one lane.
// The A2A payload type of a message is known only after the next event, so each message is held briefly.
import { randomUUID } from 'node:crypto';
import type { A2APayload, NegotiationEvent as SharedEvent, NegotiationMessage, OrderItem } from '@botir/shared';
import type { Product } from '../agents';
import type { AgentMessage, NegotiationEvent as AgentEvent, Offer } from '../agents/shared';

const HOLD_MS = 400;
const OFFER_TTL_MS = 30 * 60 * 1000;

type OfferPayload = Extract<A2APayload, { type: 'OFFER' }>;

export function toOfferPayload(offer: Offer, products: Product[]): OfferPayload {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: OrderItem[] = offer.items.map((it) => ({
    catalogItemId: it.productId,
    name: byId.get(it.productId)?.name ?? it.productId,
    qty: it.qty,
    price: byId.get(it.productId)?.price ?? 0,
  }));
  return {
    type: 'OFFER', items, price: offer.total, discountPct: offer.discountPct,
    validUntil: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
    ...(offer.upsell ? { upsell: { itemId: offer.upsell.productId, name: offer.upsell.name, price: offer.upsell.price } } : {}),
  };
}

const askedDiscount = (text: string): number => {
  const m = text.match(/(\d{1,2})\s*%/);
  return m ? Number(m[1]) : 5;
};

interface Held {
  message: AgentMessage;
  fromAgent: 'personal' | 'business';
  timer: NodeJS.Timeout;
}

export class LaneMapper {
  private held?: Held;
  private round = 0;
  private personalCount = 0;
  private lastOffer?: OfferPayload;

  constructor(
    private readonly negotiationId: string,
    private readonly businessId: string,
    private readonly products: Product[],
    private readonly emit: (e: SharedEvent) => void,
    private readonly appliedMemory: string[] = [],
  ) {}

  /** Final lane status: closes a held personal message as ACCEPT / REJECT. */
  finish(status: string): void {
    if (!this.held) return;
    const h = this.held;
    if (h.fromAgent === 'personal' && this.personalCount > 1) {
      this.flush(status === 'agreed' ? { type: 'ACCEPT' } : { type: 'REJECT', reason: h.message.text });
    } else this.flush();
  }

  handle(e: AgentEvent): void {
    if (e.type === 'offer') {
      this.lastOffer = toOfferPayload(e.offer, this.products);
      if (this.held?.fromAgent === 'business') this.flush(this.lastOffer);
      return;
    }
    if (e.type === 'status') {
      if (e.status !== 'running') this.finish(e.status);
      return;
    }
    const m = e.message;
    if (m.role === 'system' || m.role === 'user') {
      // "Taklif tayyor" / PolicyGuard notes are not part of the A2A dialogue; they only close the held message.
      if (this.held?.fromAgent === 'personal' && this.personalCount > 1) this.flush({ type: 'ACCEPT' });
      return;
    }
    this.flush();
    const fromAgent = m.role === 'biz_agent' ? 'business' : 'personal';
    if (fromAgent === 'business') this.round += 1;
    else this.personalCount += 1;
    this.held = { message: m, fromAgent, timer: setTimeout(() => this.flush(), HOLD_MS) };
  }

  private flush(payload?: A2APayload): void {
    const h = this.held;
    if (!h) return;
    clearTimeout(h.timer);
    this.held = undefined;
    const p = payload ?? this.defaultPayload(h);
    const message: NegotiationMessage = {
      id: h.message.id || randomUUID(),
      negotiationId: this.negotiationId,
      fromAgent: h.fromAgent,
      businessId: this.businessId,
      round: Math.max(1, Math.min(3, this.round)),
      text: h.message.text,
      payload: p,
      createdAt: h.message.at,
    };
    this.emit({ type: 'message', message });
  }

  private defaultPayload(h: Held): A2APayload {
    if (h.fromAgent === 'personal') {
      if (this.personalCount === 1) {
        return {
          type: 'REQUEST', taskId: `${this.negotiationId}:${this.businessId}`, need: h.message.text,
          ...(this.appliedMemory.length ? { appliedMemory: this.appliedMemory } : {}),
        };
      }
      return { type: 'COUNTER', askDiscountPct: askedDiscount(h.message.text), reason: h.message.text };
    }
    // Business reply without a (new) offer: clarification on the current offer.
    return this.lastOffer ?? { type: 'COUNTER', askDiscountPct: 0, reason: 'clarify' };
  }
}
