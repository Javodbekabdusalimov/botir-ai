import type { AgentMessage, Offer } from '../shared';
import type {
  AgentBusiness,
  AuditFinding,
  BusinessCategory,
  GoldenCase,
  LlmCallRecord,
  MemoryFact,
  PolicyViolationRecord,
  Product,
  PromptVersion,
  Proposal,
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
  getAuditFindings(businessId: string): Promise<AuditFinding[]>;
  // Loop engineering
  getGoldenCases(businessId: string): Promise<GoldenCase[]>;
  getPromptVersions(businessId: string): Promise<PromptVersion[]>; // ordered by version asc
  savePromptVersion(v: PromptVersion): Promise<void>; // upsert by id
  getProposals(businessId: string): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  saveProposal(p: Proposal): Promise<void>; // upsert by id
}
