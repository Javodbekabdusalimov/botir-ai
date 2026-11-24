import type { AgentMessage, Offer } from '../shared';
import type {
  AgentBusiness,
  AuditFinding,
  BusinessCategory,
  LlmCallRecord,
  MemoryFact,
  PolicyViolationRecord,
  Product,
} from '../types';

/** Persistence port. MemoryStore for demo; Ibrat's PrismaStore implements the same interface. */
export interface AgentStore {
  getBusinesses(filter?: { category?: BusinessCategory; area?: string }): Promise<AgentBusiness[]>;
  getProducts(businessId: string): Promise<Product[]>;
  saveMessage(sessionId: string, message: AgentMessage): Promise<void>;
  saveOffer(offer: Offer): Promise<void>;
  saveLlmCall(call: LlmCallRecord): Promise<void>;
  saveMemoryFact(fact: MemoryFact): Promise<void>;
  getMemoryFacts(userId: string): Promise<MemoryFact[]>;
  savePolicyViolation(v: PolicyViolationRecord): Promise<void>;
  saveAuditFinding(f: AuditFinding): Promise<void>;
}
