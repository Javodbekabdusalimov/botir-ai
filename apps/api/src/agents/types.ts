// Agent layer internal types. Shared contract types come from @botir/shared (via ./shared).
import type { Business, BusinessCategory, Product } from './shared';

export interface BusinessHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

/** Business enriched with fields the agents need (hours, demo flag, extra notes). */
export interface AgentBusiness extends Business {
  hours: BusinessHours;
  isDemo: boolean;
  notes?: string; // free text for the prompt (slots, tables, etc.)
}

export type LlmModel = 'sonnet' | 'haiku';

export interface LlmCallRecord {
  model: LlmModel;
  ms: number;
  chars: number;
  purpose: string;
  ok: boolean;
  at: string;
}

export interface MemoryFact {
  userId: string;
  fact: string;
  weight: number; // 0..1
  sessionId?: string;
  at: string;
}

export interface PolicyViolationRecord {
  scope: 'offer' | 'telegram';
  reason: string;
  sessionId?: string;
  businessId?: string;
  repaired: boolean;
  at: string;
}

export type AuditFindingType = 'fabricated_price' | 'policy' | 'unanswered' | 'not_found';

export interface AuditFinding {
  id: string;
  sessionId: string;
  businessId?: string;
  type: AuditFindingType;
  detail: string;
  at: string;
}

// ---- Loop engineering (self-improvement with human approval) ----

/** Golden question for a business: the answer must contain `expected` facts and none of `forbidden`. */
export interface GoldenCase {
  id: string;
  businessId: string;
  question: string;
  expected: string[];
  forbidden?: string[];
}

export type PromptVersionStatus = 'active' | 'proposed' | 'rejected' | 'rolled_back' | 'superseded';

/** Owner-approved extra instructions appended to the business agent system prompt. */
export interface PromptVersion {
  id: string;
  businessId: string;
  version: number;
  extraInstructions: string;
  status: PromptVersionStatus;
  scoreBefore?: number;
  scoreAfter?: number;
  createdAt: string;
}

export type ProposalKind = 'prompt' | 'catalog' | 'faq';
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  businessId: string;
  kind: ProposalKind;
  change: string;
  reason: string;
  sourceFindingIds: string[];
  status: ProposalStatus;
  evalBefore?: number;
  evalAfter?: number;
  createdAt: string;
}

export interface UserTask {
  category: BusinessCategory;
  need: string;
  when?: string;
  people?: number;
  area?: string;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

export type { Business, BusinessCategory, Product };
