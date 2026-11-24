import { Inject, Injectable } from '@nestjs/common';
import type {
  AgentBusiness, AgentStore, AuditFinding, BusinessCategory, LlmCallRecord, MemoryFact, PolicyViolationRecord, Product,
} from '../agents';
import type { AgentMessage, Offer } from '../agents/shared';
import { parseJson } from '../common/http';
import { toAgentBusiness, toProduct } from './mappers';
import { PrismaService } from './prisma.service';

/** Agent sessions are per (negotiation, business): sessionId = `${negotiationId}:${businessId}`. */
export const sessionIdOf = (negotiationId: string, businessId: string): string => `${negotiationId}:${businessId}`;
export function splitSessionId(sessionId: string): { negotiationId: string; businessId: string } {
  const i = sessionId.indexOf(':');
  return i < 0 ? { negotiationId: sessionId, businessId: '' } : { negotiationId: sessionId.slice(0, i), businessId: sessionId.slice(i + 1) };
}

@Injectable()
export class PrismaAgentStore implements AgentStore {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async getBusinesses(filter?: { category?: BusinessCategory; area?: string }): Promise<AgentBusiness[]> {
    const rows = await this.db.business.findMany({
      where: { deletedAt: null, ...(filter?.category ? { category: filter.category } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    const area = filter?.area?.toLowerCase();
    return rows
      .filter((b) => !area || b.district.toLowerCase().includes(area) || area.includes(b.district.toLowerCase()))
      .map(toAgentBusiness);
  }

  async getProducts(businessId: string): Promise<Product[]> {
    const rows = await this.db.catalogItem.findMany({ where: { businessId, deletedAt: null, inStock: true } });
    return rows.map(toProduct);
  }

  /** Raw agent messages are mapped to the shared shape by NegotiationsService; nothing to persist here. */
  async saveMessage(_sessionId: string, _message: AgentMessage): Promise<void> {}

  async saveOffer(offer: Offer): Promise<void> {
    const { negotiationId, businessId } = splitSessionId(offer.sessionId);
    const data = {
      sessionId: offer.sessionId, negotiationId, businessId, items: JSON.stringify(offer.items),
      total: offer.total, discountPct: offer.discountPct, status: offer.status,
    };
    await this.db.agentOffer.upsert({ where: { id: offer.id }, create: { id: offer.id, ...data }, update: data });
  }

  async saveLlmCall(call: LlmCallRecord): Promise<void> {
    await this.db.llmCall.create({ data: { ...call, at: new Date(call.at) } });
  }

  async saveMemoryFact(fact: MemoryFact): Promise<void> {
    const businessId = fact.sessionId ? splitSessionId(fact.sessionId).businessId || null : null;
    await this.db.memoryFact.create({
      data: { userId: fact.userId, fact: fact.fact, weight: fact.weight, sessionId: fact.sessionId, businessId, at: new Date(fact.at) },
    });
  }

  async getMemoryFacts(userId: string): Promise<MemoryFact[]> {
    const rows = await this.db.memoryFact.findMany({ where: { userId, deletedAt: null } });
    return rows.map((r) => ({ userId: r.userId, fact: r.fact, weight: r.weight, sessionId: r.sessionId ?? undefined, at: r.at.toISOString() }));
  }

  async savePolicyViolation(v: PolicyViolationRecord): Promise<void> {
    await this.db.policyViolation.create({ data: { ...v, at: new Date(v.at) } });
  }

  async saveAuditFinding(f: AuditFinding): Promise<void> {
    const businessId = splitSessionId(f.sessionId).businessId || null;
    await this.db.auditFinding.create({ data: { sessionId: f.sessionId, businessId, type: f.type, detail: f.detail, at: new Date(f.at) } });
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    const r = await this.db.agentOffer.findUnique({ where: { id } });
    if (!r) return undefined;
    return { id: r.id, sessionId: r.sessionId, items: parseJson(r.items, []), total: r.total, discountPct: r.discountPct, status: r.status as Offer['status'] };
  }
}
