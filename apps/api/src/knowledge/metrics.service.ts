import { Inject, Injectable } from '@nestjs/common';
import type { KnowledgeMetrics } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { requiredTopics, topicOf } from './topics';

const MINUTE = 60_000;

@Injectable()
export class MetricsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** null = no data yet (never a fake 0). */
  async forBusiness(businessId: string): Promise<KnowledgeMetrics> {
    const [business, aiTurns, answered, items, facts] = await Promise.all([
      this.db.business.findFirst({ where: { id: businessId, deletedAt: null } }),
      this.db.agentTurn.count({ where: { businessId } }),
      this.db.agentTurn.count({ where: { businessId, answered: true } }),
      this.db.catalogItem.count({ where: { businessId, deletedAt: null } }),
      this.db.knowledgeFact.findMany({
        where: { businessId, status: 'confirmed', deletedAt: null, kind: { not: 'catalog' } },
        select: { kind: true, topic: true, question: true },
      }),
    ]);
    const covered = new Set(facts.flatMap((f) => [f.topic, topicOf(`${f.topic} ${f.question ?? ''}`)]));
    if (facts.some((f) => f.kind === 'profile')) covered.add('profile');
    if (items > 0) covered.add('catalog');
    const readyMs = business?.agentReadyAt ? business.agentReadyAt.getTime() - business.createdAt.getTime() : null;
    return {
      aiAnsweredPct: aiTurns > 0 ? Math.round((answered / aiTurns) * 100) : null,
      aiTurns,
      minutesToReady: readyMs === null ? null : Math.max(0, Math.round(readyMs / MINUTE)),
      missingTopics: ['profile', 'catalog', ...requiredTopics(business?.category ?? '')].filter((t) => !covered.has(t)),
    };
  }

  /** Call after a catalog item or a confirmed fact appears. Sets Business.agentReadyAt only once. */
  async touchReady(businessId: string): Promise<void> {
    const [items, facts] = await Promise.all([
      this.db.catalogItem.count({ where: { businessId, deletedAt: null } }),
      this.db.knowledgeFact.count({ where: { businessId, status: 'confirmed', deletedAt: null } }),
    ]);
    if (items === 0 || facts === 0) return;
    await this.db.business.updateMany({ where: { id: businessId, agentReadyAt: null, deletedAt: null }, data: { agentReadyAt: new Date() } });
  }
}
