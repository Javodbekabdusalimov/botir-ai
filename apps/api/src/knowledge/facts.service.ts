import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { KnowledgeFact as DbFact, Prisma } from '@prisma/client';
import type { KnowledgeFact, KnowledgeFactKind, KnowledgeFactStatus, KnowledgeSource, KnowledgeSourceKind } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { CatalogWriter } from './catalog-writer.service';
import { isValidPrice, LIMITS } from './fact-validation';
import { MetricsService } from './metrics.service';
import { toSource } from './sources.service';
import { cleanLine, normalizeName } from './text-utils';

const STATUSES: readonly KnowledgeFactStatus[] = ['draft', 'confirmed', 'rejected'];
const MAX_CONFIRM = 500;

const toFact = (f: DbFact, sourceKind: KnowledgeSourceKind): KnowledgeFact => ({
  id: f.id,
  sourceId: f.sourceId,
  sourceKind,
  kind: f.kind as KnowledgeFactKind,
  topic: f.topic,
  ...(f.question !== null && { question: f.question }),
  content: f.content,
  ...(f.price !== null && { price: f.price }),
  ...(f.unit !== null && { unit: f.unit }),
  ...(f.evidence !== null && { evidence: f.evidence }),
  confidence: f.confidence,
  status: f.status as KnowledgeFactStatus,
  createdAt: f.createdAt.toISOString(),
});

@Injectable()
export class KnowledgeFactsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CatalogWriter) private readonly catalog: CatalogWriter,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async overview(businessId: string): Promise<{ sources: KnowledgeSource[]; facts: KnowledgeFact[] }> {
    const [sources, facts] = await Promise.all([
      this.db.knowledgeSource.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      this.db.knowledgeFact.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);
    const counts = new Map<string, number>();
    for (const f of facts) counts.set(f.sourceId, (counts.get(f.sourceId) ?? 0) + 1);
    return { sources: sources.map((s) => toSource(s, counts.get(s.id) ?? 0)), facts: this.withKinds(facts, sources) };
  }

  async confirm(businessId: string, rawIds: unknown): Promise<KnowledgeFact[]> {
    if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > MAX_CONFIRM || !rawIds.every((x) => typeof x === 'string')) {
      throw new BadRequestException(`ids: 1 dan ${MAX_CONFIRM} tagacha fakt tanlang`);
    }
    const ids = [...new Set(rawIds as string[])];
    const facts = await this.find(businessId, ids);
    await this.activate(businessId, facts.filter((f) => f.status !== 'confirmed'));
    return this.read(businessId, ids);
  }

  async patch(businessId: string, factId: string, dto: unknown): Promise<KnowledgeFact> {
    const [fact] = await this.find(businessId, [factId]);
    if (!fact) throw new NotFoundException('fact not found');
    const patch = (typeof dto === 'object' && dto !== null ? dto : {}) as Record<string, unknown>;
    const data = this.editData(fact, patch);
    const status = patch.status === undefined ? (fact.status as KnowledgeFactStatus) : STATUSES.find((s) => s === patch.status);
    if (!status) throw new BadRequestException(`status: ${STATUSES.join(' | ')}`);

    const leaving = fact.status === 'confirmed' && status !== 'confirmed';
    if (leaving) await this.assertNotInCatalog(fact);
    const edited = Object.keys(data).length > 0;
    if (edited || status !== fact.status) {
      // Confirmation itself happens in activate(), after the catalog write succeeded.
      const next = await this.db.knowledgeFact.update({
        where: { id: fact.id }, data: { ...data, ...(status !== 'confirmed' && { status, confirmedAt: null }) },
      });
      if (status === 'confirmed') await this.activate(businessId, [next]);
    }
    const [out] = await this.read(businessId, [factId]);
    if (!out) throw new NotFoundException('fact not found');
    return out;
  }

  /** Catalog facts become CatalogItems (create or update by name), then everything is marked confirmed. */
  private async activate(businessId: string, facts: DbFact[]): Promise<void> {
    if (!facts.length) return;
    const priced = facts.filter((f): f is DbFact & { price: number } => f.kind === 'catalog' && f.price !== null);
    if (priced.length !== facts.filter((f) => f.kind === 'catalog').length) throw new BadRequestException('Katalog fakti uchun narx kerak');
    const { ids } = await this.catalog.upsert(
      businessId, priced.map((f) => ({
        name: f.topic, price: f.price, unit: f.unit ?? undefined, itemId: f.catalogItemId,
        description: normalizeName(f.content) === normalizeName(f.topic) ? undefined : f.content,
      })),
    );
    const now = new Date();
    await this.db.$transaction([
      ...priced.map((f, i) => this.db.knowledgeFact.update({ where: { id: f.id }, data: { catalogItemId: ids[i] } })),
      this.db.knowledgeFact.updateMany({ where: { id: { in: facts.map((f) => f.id) } }, data: { status: 'confirmed' } }),
      this.db.knowledgeFact.updateMany({ where: { id: { in: facts.map((f) => f.id) }, confirmedAt: null }, data: { confirmedAt: now } }),
    ]);
    await this.metrics.touchReady(businessId);
  }

  /** A confirmed price already lives in the catalog; hiding only the fact would leave the agent selling it. */
  private async assertNotInCatalog(fact: DbFact): Promise<void> {
    if (!fact.catalogItemId) return;
    const item = await this.db.catalogItem.findFirst({ where: { id: fact.catalogItemId, deletedAt: null } });
    if (item) throw new ConflictException(`"${item.name}" katalogga qo‘shilgan. Avval uni katalogdan o‘chiring`);
  }

  private editData(fact: DbFact, patch: Record<string, unknown>): Prisma.KnowledgeFactUpdateInput {
    const data: Prisma.KnowledgeFactUpdateInput = {};
    const text = (key: 'topic' | 'content' | 'question' | 'unit'): string | undefined => {
      const v = patch[key];
      if (v === undefined) return undefined;
      if (typeof v !== 'string') throw new BadRequestException(`${key} matn bo‘lishi kerak`);
      const clean = cleanLine(v, LIMITS[key]);
      if (!clean && key !== 'unit') throw new BadRequestException(`${key} bo‘sh bo‘lmasin`);
      return clean;
    };
    const topic = text('topic');
    const content = text('content');
    const question = text('question');
    const unit = text('unit');
    if (question !== undefined && fact.kind !== 'faq') throw new BadRequestException('question faqat faq uchun');
    if ((unit !== undefined || patch.price !== undefined) && fact.kind !== 'catalog') throw new BadRequestException('price va unit faqat katalog uchun');
    if (patch.price !== undefined && !isValidPrice(patch.price)) throw new BadRequestException('price — 0 yoki undan katta butun son');
    if (topic !== undefined) data.topic = topic;
    if (content !== undefined) data.content = content;
    if (question !== undefined) data.question = question;
    if (unit !== undefined) data.unit = unit || null;
    if (isValidPrice(patch.price)) data.price = patch.price;
    return data;
  }

  /** All ids or 404: another business's fact looks exactly like a missing one. */
  private async find(businessId: string, ids: string[]): Promise<DbFact[]> {
    const facts = await this.db.knowledgeFact.findMany({ where: { id: { in: ids }, businessId, deletedAt: null } });
    if (facts.length !== ids.length) throw new NotFoundException('fact not found');
    return facts;
  }

  private async read(businessId: string, ids: string[]): Promise<KnowledgeFact[]> {
    const [facts, sources] = await Promise.all([
      this.db.knowledgeFact.findMany({ where: { id: { in: ids }, businessId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      this.db.knowledgeSource.findMany({ where: { businessId }, select: { id: true, kind: true } }),
    ]);
    return this.withKinds(facts, sources);
  }

  private withKinds(facts: DbFact[], sources: { id: string; kind: string }[]): KnowledgeFact[] {
    const kinds = new Map(sources.map((s) => [s.id, s.kind as KnowledgeSourceKind]));
    return facts.map((f) => toFact(f, kinds.get(f.sourceId) ?? 'text'));
  }
}
