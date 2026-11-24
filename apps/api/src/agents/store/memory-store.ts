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
import type { AgentStore } from './agent-store';
import { DEMO_GOLDEN_CASES } from './golden-seed';
import { DEMO_BUSINESSES, DEMO_PRODUCTS } from './seed';

/** In-memory AgentStore seeded with 3 demo businesses. Everything is kept for inspection. */
export class MemoryStore implements AgentStore {
  readonly businesses: AgentBusiness[];
  readonly products: Product[];
  readonly messages: { sessionId: string; message: AgentMessage }[] = [];
  readonly offers: Offer[] = [];
  readonly llmCalls: LlmCallRecord[] = [];
  readonly memoryFacts: MemoryFact[] = [];
  readonly violations: PolicyViolationRecord[] = [];
  readonly findings: AuditFinding[] = [];
  readonly goldenCases: GoldenCase[];
  readonly promptVersions: PromptVersion[] = [];
  readonly proposals: Proposal[] = [];

  constructor(seed = true) {
    this.businesses = seed ? DEMO_BUSINESSES.map((b) => ({ ...b })) : [];
    this.products = seed ? DEMO_PRODUCTS.map((p) => ({ ...p })) : [];
    this.goldenCases = seed ? DEMO_GOLDEN_CASES.map((c) => ({ ...c })) : [];
  }

  async getBusinesses(filter?: { category?: BusinessCategory; area?: string }): Promise<AgentBusiness[]> {
    const area = filter?.area?.toLowerCase();
    return this.businesses.filter(
      (b) =>
        (!filter?.category || b.category === filter.category) &&
        (!area || b.area.toLowerCase().includes(area) || area.includes(b.area.toLowerCase())),
    );
  }

  async getProducts(businessId: string): Promise<Product[]> {
    return this.products.filter((p) => p.businessId === businessId);
  }

  async saveMessage(sessionId: string, message: AgentMessage): Promise<void> {
    this.messages.push({ sessionId, message });
  }

  async saveOffer(offer: Offer): Promise<void> {
    const i = this.offers.findIndex((o) => o.id === offer.id);
    if (i >= 0) this.offers[i] = offer;
    else this.offers.push(offer);
  }

  async saveLlmCall(call: LlmCallRecord): Promise<void> {
    this.llmCalls.push(call);
  }

  async saveMemoryFact(fact: MemoryFact): Promise<void> {
    this.memoryFacts.push(fact);
  }

  async getMemoryFacts(userId: string): Promise<MemoryFact[]> {
    return this.memoryFacts.filter((f) => f.userId === userId);
  }

  async savePolicyViolation(v: PolicyViolationRecord): Promise<void> {
    this.violations.push(v);
  }

  async saveAuditFinding(f: AuditFinding): Promise<void> {
    this.findings.push(f);
  }

  async getAuditFindings(businessId: string): Promise<AuditFinding[]> {
    return this.findings.filter((f) => f.businessId === businessId);
  }

  async getGoldenCases(businessId: string): Promise<GoldenCase[]> {
    return this.goldenCases.filter((c) => c.businessId === businessId);
  }

  async getPromptVersions(businessId: string): Promise<PromptVersion[]> {
    return this.promptVersions.filter((v) => v.businessId === businessId).sort((a, b) => a.version - b.version);
  }

  async savePromptVersion(v: PromptVersion): Promise<void> {
    upsert(this.promptVersions, v);
  }

  async getProposals(businessId: string): Promise<Proposal[]> {
    return this.proposals.filter((p) => p.businessId === businessId);
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    return this.proposals.find((p) => p.id === id);
  }

  async saveProposal(p: Proposal): Promise<void> {
    upsert(this.proposals, p);
  }
}

function upsert<T extends { id: string }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = { ...item };
  else list.push({ ...item });
}
