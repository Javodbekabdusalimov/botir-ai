import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { KnowledgeFact as DbFact, Prisma } from '@prisma/client';
import type { KnowledgeFact, KnowledgeFactKind, KnowledgeFactStatus, KnowledgeSource, KnowledgeSourceKind } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { CatalogWriter } from './catalog-writer.service';
import { LIMITS } from './fact-validation';
import { MetricsService } from './metrics.service';
import { normalizeQuestion } from './questions.service';
import { toSource } from './sources.service';
import { cleanLine, normalizeName, parseSom } from './text-utils';

/** What the owner may set; 'superseded' is set only by a newer confirmed fact. */
const STATUSES: readonly KnowledgeFactStatus[] = ['draft', 'confirmed', 'rejected'];
const MAX_CONFIRM = 500;
// Topics that hold many independent facts: a new one adds to them and replaces nothing.
const OPEN_TOPICS = new Set(['other', 'about']);

/** Two confirmed facts with one key cannot both be true (same product, question or topic). null = never conflicts. */
function conflictKey(f: Pick<DbFact, 'kind' | 'topic' | 'question' | 'catalogItemId'>): string | null {
  if (f.kind === 'catalog') return f.catalogItemId ? `catalog|${f.catalogItemId}` : null;
  if (f.kind === 'faq') return `faq|${normalizeQuestion(f.question ?? '')}`;
  return OPEN_TOPICS.has(f.topic) ? null : `${f.kind}|${normalizeName(f.topic)}`;
}

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
    // Drafts only: a stale selection must never revive a fact the owner rejected (PATCH status does that on purpose).
    await this.activate(businessId, facts.filter((f) => f.status === 'draft'));
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

  /** Soft delete. A confirmed price leaves the catalog too: hiding only the fact would leave the agent selling it. */
  async remove(businessId: string, factId: string): Promise<{ id: string }> {
    const [fact] = await this.find(businessId, [factId]);
    if (!fact) throw new NotFoundException('fact not found');
    const itemId = fact.status === 'confirmed' ? fact.catalogItemId : null; // older (superseded) facts share the live item
    const now = new Date();
    await this.db.$transaction([
      this.db.knowledgeFact.update({ where: { id: fact.id }, data: { deletedAt: now } }),
      ...(itemId ? [this.db.catalogItem.updateMany({ where: { id: itemId, businessId, deletedAt: null }, data: { deletedAt: now } })] : []),
    ]);
    return { id: fact.id };
  }

  /**
   * Catalog facts become CatalogItems (create or update by name), then everything is marked confirmed.
   * Older confirmed facts about the same product / question / topic become 'superseded', so the agent sees only the newest.
   */
  private async activate(businessId: string, facts: DbFact[]): Promise<void> {
    if (!facts.length) return;
    const priced = facts.filter((f): f is DbFact & { price: number } => f.kind === 'catalog' && f.price !== null);
    if (priced.length !== facts.filter((f) => f.kind === 'catalog').length) throw new BadRequestException('Katalog fakti uchun narx kerak');
    const { ids } = await this.catalog.upsert(
      businessId, priced.map((f) => ({
        name: f.topic, price: f.price, unit: f.unit ?? undefined, itemId: f.catalogItemId, similar: true,
        description: normalizeName(f.content) === normalizeName(f.topic) ? undefined : f.content,
      })),
    );
    const itemOf = new Map(priced.map((f, i) => [f.id, ids[i] ?? null]));
    const batch = facts.map((f) => ({ ...f, catalogItemId: itemOf.get(f.id) ?? f.catalogItemId }));
    // Only facts becoming confirmed (new or restored) replace others: editing a confirmed fact must not archive its batch-mates.
    const stale = await this.staleBy(businessId, batch.filter((f) => f.status !== 'confirmed'));
    const now = new Date();
    await this.db.$transaction([
      ...priced.map((f) => this.db.knowledgeFact.update({ where: { id: f.id }, data: { catalogItemId: itemOf.get(f.id) ?? null } })),
      this.db.knowledgeFact.updateMany({ where: { id: { in: facts.map((f) => f.id) } }, data: { status: 'confirmed' } }),
      this.db.knowledgeFact.updateMany({ where: { id: { in: facts.filter((f) => f.status !== 'confirmed').map((f) => f.id) } }, data: { confirmedAt: now } }),
      this.db.knowledgeFact.updateMany({ where: { id: { in: stale } }, data: { status: 'superseded' } }),
    ]);
    await this.metrics.touchReady(businessId);
  }

  /** Confirmed facts the batch replaces. Same product twice in one batch: the catalog kept the last price, so the last fact stays. */
  private async staleBy(businessId: string, batch: DbFact[]): Promise<string[]> {
    const keys = new Set(batch.map(conflictKey).filter((k): k is string => k !== null));
    if (!keys.size) return [];
    const older = await this.db.knowledgeFact.findMany({
      where: { businessId, status: 'confirmed', deletedAt: null, id: { notIn: batch.map((f) => f.id) }, kind: { in: [...new Set(batch.map((f) => f.kind))] } },
    });
    const lastOfItem = new Map(batch.filter((f) => f.kind === 'catalog').map((f) => [conflictKey(f), f.id]));
    return [
      ...older.filter((f) => keys.has(conflictKey(f) ?? '')).map((f) => f.id),
      ...batch.filter((f) => f.kind === 'catalog' && lastOfItem.get(conflictKey(f)) !== f.id).map((f) => f.id),
    ];
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
    // The owner types "45.000" or "45 ming": parsed here, so a browser's Number("45.000") = 45 can never reach the catalog.
    const price = patch.price === undefined ? undefined : parseSom(patch.price);
    if (price === null) throw new BadRequestException('Narxni so‘mda yozing: 45000, "45 000", "45.000" yoki "45 ming"');
    if (topic !== undefined) data.topic = topic;
    if (content !== undefined) data.content = content;
    if (question !== undefined) data.question = question;
    if (unit !== undefined) data.unit = unit || null;
    if (price !== undefined) data.price = price;
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
