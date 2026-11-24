import type { BusinessCategory } from '@prisma/client';

/** A2A payload shapes — mirrors packages/shared (A2APayload). */
export type A2APayload =
  | { type: 'REQUEST'; taskId: string; need: string; when?: string; people?: number; budget?: number }
  | {
      type: 'OFFER';
      items: { catalogItemId: string; name: string; qty: number; price: number }[];
      price: number;
      discountPct: number;
      validUntil: string;
      slot?: { start: string; end: string };
    }
  | { type: 'COUNTER'; askDiscountPct: number; reason: string }
  | { type: 'ACCEPT' }
  | { type: 'REJECT'; reason: string };

export interface NegotiationTask {
  taskId: string;
  category: BusinessCategory;
  need: string;
  when?: string;
  where?: string;
  people?: number;
  budget?: number;
}

export interface AgentTurn {
  fromAgent: 'personal' | 'business';
  businessId: string;
  round: number;
  /** Human-readable line rendered on the negotiation screen. */
  text: string;
  payload: A2APayload;
}

/**
 * Contract between the API and the agent layer.
 *
 * Habibulloh owns apps/api/src/agents (live LLM agents). This bridge is the seam:
 * AgentsModule provides AGENTS_BRIDGE and overrides the rule-based baseline below,
 * so neither side blocks the other.
 */
export interface AgentsBridge {
  /** Splits free-form user text into tasks. */
  parseTasks(text: string): Promise<NegotiationTask[]>;

  /** Runs one negotiation with one business and yields every A2A turn in order. */
  negotiate(task: NegotiationTask, businessId: string): AsyncIterable<AgentTurn>;
}

export const AGENTS_BRIDGE = Symbol('AGENTS_BRIDGE');
