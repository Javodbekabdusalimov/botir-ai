import { Inject, Injectable } from '@nestjs/common';
import type { Analytics, NegotiationTask } from '@botir/shared';
import { parseJson } from '../common/http';
import { PrismaService } from '../db/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
const LOST_AFTER_DAYS = 30;

const top = (values: string[], n = 10): { query: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v.trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([query, count]) => ({ query, count }));
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** topRequests: tasks of negotiations this business took part in; notFound: auditor findings + unmatched tasks. */
  async forBusiness(businessId: string): Promise<Analytics> {
    const business = await this.db.business.findUniqueOrThrow({ where: { id: businessId } });
    const negIds = (
      await this.db.negotiationMessage.findMany({ where: { businessId }, select: { negotiationId: true }, distinct: ['negotiationId'] })
    ).map((m) => m.negotiationId);
    const negs = await this.db.negotiation.findMany({ where: { id: { in: negIds } } });
    const needs = negs.flatMap((n) => parseJson<NegotiationTask[]>(n.tasks, []).filter((t) => t.category === business.category).map((t) => t.need));

    const findings = await this.db.auditFinding.findMany({
      where: { type: 'not_found', deletedAt: null, OR: [{ businessId }, { businessId: null }] },
    });

    const orders = await this.db.order.findMany({ where: { businessId, deletedAt: null } });
    const now = Date.now();
    const sum = (sinceMs: number) =>
      orders.filter((o) => o.status === 'paid' && now - o.updatedAt.getTime() < sinceMs).reduce((s, o) => s + o.total, 0);

    const lastByUser = new Map<string, Date>();
    for (const o of orders) {
      const prev = lastByUser.get(o.userId);
      if (!prev || prev < o.createdAt) lastByUser.set(o.userId, o.createdAt);
    }
    const lostCustomers = [...lastByUser.entries()]
      .filter(([, at]) => now - at.getTime() > LOST_AFTER_DAYS * DAY)
      .map(([userId, at]) => ({ userId, name: userId.slice(0, 8), lastOrderAt: at.toISOString() }));

    return {
      topRequests: top(needs),
      notFound: top(findings.map((f) => f.detail)),
      lostCustomers,
      revenue: { today: sum(DAY), week: sum(7 * DAY), month: sum(30 * DAY) },
    };
  }
}
