import { Inject, Injectable } from '@nestjs/common';
import type { LoopProposal as DbProposal } from '@prisma/client';
import type {
  AgentBusiness, AgentStore, AuditFinding, AuditFindingType, BusinessCategory, GoldenCase, LlmCallRecord, MemoryFact,
  PolicyViolationRecord, Product, PromptVersion, PromptVersionStatus, Proposal, ProposalKind, ProposalStatus,
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
    const businessId = f.businessId ?? (splitSessionId(f.sessionId).businessId || null);
    await this.db.auditFinding.create({
      data: { id: f.id, sessionId: f.sessionId, businessId, type: f.type, detail: f.detail, at: new Date(f.at) },
    });
  }

  async getAuditFindings(businessId: string): Promise<AuditFinding[]> {
    const rows = await this.db.auditFinding.findMany({ where: { businessId, deletedAt: null }, orderBy: { at: 'asc' } });
    return rows.map((r) => ({
      id: r.id, sessionId: r.sessionId, businessId: r.businessId ?? undefined, type: r.type as AuditFindingType, detail: r.detail, at: r.at.toISOString(),
    }));
  }

  async getGoldenCases(businessId: string): Promise<GoldenCase[]> {
    const rows = await this.db.goldenCase.findMany({ where: { businessId, deletedAt: null } });
    return rows.map((r) => ({
      id: r.id, businessId: r.businessId, question: r.question, expected: parseJson<string[]>(r.expected, []),
      ...(r.forbidden ? { forbidden: parseJson<string[]>(r.forbidden, []) } : {}),
    }));
  }

  async getPromptVersions(businessId: string): Promise<PromptVersion[]> {
    const rows = await this.db.promptVersion.findMany({ where: { businessId, deletedAt: null }, orderBy: { version: 'asc' } });
    return rows.map((r) => ({
      id: r.id, businessId: r.businessId, version: r.version, extraInstructions: r.extraInstructions,
      status: r.status as PromptVersionStatus, scoreBefore: r.scoreBefore ?? undefined, scoreAfter: r.scoreAfter ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async savePromptVersion(v: PromptVersion): Promise<void> {
    const data = {
      businessId: v.businessId, version: v.version, extraInstructions: v.extraInstructions, status: v.status,
      scoreBefore: v.scoreBefore ?? null, scoreAfter: v.scoreAfter ?? null, createdAt: new Date(v.createdAt),
    };
    await this.db.promptVersion.upsert({ where: { id: v.id }, create: { id: v.id, ...data }, update: data });
  }

  async getProposals(businessId: string): Promise<Proposal[]> {
    const rows = await this.db.loopProposal.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(toProposal);
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const r = await this.db.loopProposal.findFirst({ where: { id, deletedAt: null } });
    return r ? toProposal(r) : undefined;
  }

  async saveProposal(p: Proposal): Promise<void> {
    const data = {
      businessId: p.businessId, kind: p.kind, change: p.change, reason: p.reason, sourceFindingIds: JSON.stringify(p.sourceFindingIds),
      evalBefore: p.evalBefore ?? null, evalAfter: p.evalAfter ?? null, status: p.status, createdAt: new Date(p.createdAt),
    };
    await this.db.loopProposal.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    const r = await this.db.agentOffer.findUnique({ where: { id } });
    if (!r) return undefined;
    return { id: r.id, sessionId: r.sessionId, items: parseJson(r.items, []), total: r.total, discountPct: r.discountPct, status: r.status as Offer['status'] };
  }
}

const toProposal = (r: DbProposal): Proposal => ({
  id: r.id, businessId: r.businessId, kind: r.kind as ProposalKind, change: r.change, reason: r.reason,
  sourceFindingIds: parseJson<string[]>(r.sourceFindingIds, []), status: r.status as ProposalStatus,
  evalBefore: r.evalBefore ?? undefined, evalAfter: r.evalAfter ?? undefined, createdAt: r.createdAt.toISOString(),
});
