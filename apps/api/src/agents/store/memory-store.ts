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
import type { AgentStore } from './agent-store';
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

  constructor(seed = true) {
    this.businesses = seed ? DEMO_BUSINESSES.map((b) => ({ ...b })) : [];
    this.products = seed ? DEMO_PRODUCTS.map((p) => ({ ...p })) : [];
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
}
