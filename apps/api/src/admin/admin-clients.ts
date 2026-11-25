// GET /admin/clients: one row per billing owner. Users (role user, or business role without a business) bill themselves;
// a business owner is the business row (same rule as billing's ownerOfUser). Soft-deleted users / businesses are hidden.
import type { AdminClient, AdminPage, BillingOwnerType } from '@botir/shared';
import { paymentOwner } from '../billing/billing.service';
import { dayKey } from '../billing/token-budget';
import type { PrismaService } from '../db/prisma.service';
import { isPaidPlan } from '../payments/plans';
import { businessesById, DAY_MS, matches, page, REAL_PAID } from './admin-people';

export interface ClientFilter {
  q?: string;
  plan?: string; // free | pro | max
  limit?: string;
  offset?: string;
}

const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;
const latest = (...ds: (Date | null | undefined)[]): Date | null =>
  ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

export async function listClients(db: PrismaService, f: ClientFilter, now = new Date()): Promise<AdminPage<AdminClient>> {
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const [users, bizRows, accounts, subs, usage30, usageToday, lastUsage, userCost, bizCost, negs, offers] = await Promise.all([
    db.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, phone: true, role: true, businessId: true } }),
    db.business.findMany({ where: { deletedAt: null }, select: { id: true } }),
    db.planAccount.findMany({ where: { deletedAt: null } }),
    db.payment.findMany({ where: { ...REAL_PAID, kind: 'subscription' }, select: { amount: true, paidAt: true, createdAt: true, ownerType: true, ownerId: true, businessId: true } }),
    db.dailyUsage.groupBy({ by: ['ownerType', 'ownerId'], where: { deletedAt: null, day: { gte: dayKey(d30) } }, _sum: { tokensUsed: true } }),
    db.dailyUsage.groupBy({ by: ['ownerType', 'ownerId'], where: { deletedAt: null, day: dayKey(now) }, _sum: { tokensUsed: true } }),
    db.dailyUsage.groupBy({ by: ['ownerType', 'ownerId'], where: { deletedAt: null }, _max: { updatedAt: true } }),
    db.llmCall.groupBy({ by: ['userId'], where: { at: { gte: d30 }, userId: { not: null } }, _sum: { costUsd: true } }),
    db.llmCall.groupBy({ by: ['businessId'], where: { at: { gte: d30 }, businessId: { not: null } }, _sum: { costUsd: true } }),
    db.negotiation.groupBy({ by: ['userId'], where: { deletedAt: null, createdAt: { gte: d30 } }, _count: { _all: true }, _max: { createdAt: true } }),
    db.agentOffer.groupBy({ by: ['businessId', 'negotiationId'], where: { deletedAt: null, createdAt: { gte: d30 } } }),
  ]);
  const businesses = await businessesById(db, bizRows.map((b) => b.id));
  const k = (t: string, id: string | null) => `${t}:${id ?? ''}`;
  const byKey = <T>(rows: T[], key: (r: T) => string) => new Map(rows.map((r) => [key(r), r]));
  const account = byKey(accounts, (a) => k(a.ownerType, a.ownerId));
  const tok30 = byKey(usage30, (u) => k(u.ownerType, u.ownerId));
  const tokToday = byKey(usageToday, (u) => k(u.ownerType, u.ownerId));
  const lastAi = byKey(lastUsage, (u) => k(u.ownerType, u.ownerId));
  const cost = new Map([...userCost.map((c) => [k('user', c.userId), c._sum.costUsd ?? 0] as const), ...bizCost.map((c) => [k('business', c.businessId), c._sum.costUsd ?? 0] as const)]);
  const neg = byKey(negs, (n) => k('user', n.userId));
  const bizNegs = new Map<string, number>();
  for (const o of offers) bizNegs.set(o.businessId, (bizNegs.get(o.businessId) ?? 0) + 1);
  const paidBy = new Map<string, typeof subs>();
  for (const p of subs) {
    const o = paymentOwner(p);
    if (o) paidBy.set(k(o.ownerType, o.ownerId), [...(paidBy.get(k(o.ownerType, o.ownerId)) ?? []), p]);
  }

  const owners: { ownerType: BillingOwnerType; ownerId: string; name: string; phone: string | null }[] = [
    ...users.filter((u) => !(u.role === 'business' && u.businessId)).map((u) => ({ ownerType: 'user' as const, ownerId: u.id, name: u.name, phone: u.phone })),
    ...[...businesses].map(([id, b]) => ({ ownerType: 'business' as const, ownerId: id, name: b.name, phone: b.phone })),
  ];
  const rows: AdminClient[] = owners.map((o) => {
    const key = k(o.ownerType, o.ownerId);
    const acc = account.get(key);
    const plan = acc && isPaidPlan(acc.plan) && acc.expiresAt && acc.expiresAt > now ? acc.plan : 'free';
    const paid = paidBy.get(key) ?? [];
    const paidAts = paid.map((p) => p.paidAt ?? p.createdAt).sort((a, b) => a.getTime() - b.getTime());
    const lastNeg = o.ownerType === 'user' ? neg.get(key)?._max.createdAt : null;
    return {
      ...o,
      plan,
      planStartedAt: iso(paidAts[0]),
      expiresAt: iso(acc?.expiresAt),
      active: plan !== 'free',
      introUsed: paid.length > 0,
      totalPaid: paid.reduce((s, p) => s + p.amount, 0),
      paymentsCount: paid.length,
      lastPaymentAt: iso(paidAts.at(-1)),
      tokensToday: tokToday.get(key)?._sum.tokensUsed ?? 0,
      tokens30d: tok30.get(key)?._sum.tokensUsed ?? 0,
      aiCostUsd30d: cost.get(key) ?? 0,
      negotiations30d: o.ownerType === 'user' ? (neg.get(key)?._count._all ?? 0) : (bizNegs.get(o.ownerId) ?? 0),
      lastActivityAt: iso(latest(lastAi.get(key)?._max.updatedAt, lastNeg, paidAts.at(-1))),
    };
  });
  const plan = isPaidPlan(f.plan) || f.plan === 'free' ? f.plan : undefined;
  const found = rows
    .filter((r) => (!plan || r.plan === plan) && matches(f.q ?? '', r.name, r.phone))
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name));
  const { limit, offset } = page(f.limit, f.offset);
  return { total: found.length, rows: found.slice(offset, offset + limit) };
}
