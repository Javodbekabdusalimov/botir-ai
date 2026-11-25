// Owners' view of every client and every payment. Real money = status 'paid' && !isTest (invariant 3); TEST rows are
// listed and badged but never summed into revenue. Pilot scale: lists are filtered in memory over bounded queries.
import { Inject, Injectable } from '@nestjs/common';
import type { AdminClient, AdminOverview, AdminPage, AdminPayment, BillingOwnerType } from '@botir/shared';
import { paymentOwner } from '../billing/billing.service';
import { PrismaService } from '../db/prisma.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { startOfTashkentDay } from '../negotiations/request-limits';
import { fullPrice, isPaidPlan } from '../payments/plans';
import { listClients, type ClientFilter } from './admin-clients';
import { businessesById, DAY_MS, matches, page, REAL_PAID, usersById } from './admin-people';

/** Newest payments scanned by GET /admin/payments (filters by status/kind/test run in the DB first). */
const PAYMENTS_SCAN = 5000;

export interface PaymentFilter {
  status?: string;
  kind?: string;
  test?: string; // real | test (also 0/1, false/true)
  q?: string;
  limit?: string;
  offset?: string;
}

/** A real paid subscription below its plan's full price was an intro month. */
export const isIntro = (p: { amount: number; plan: string | null }): boolean => p.amount < fullPrice(isPaidPlan(p.plan) ? p.plan : 'pro');

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AGENTS) private readonly agents: Agents,
  ) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const today = startOfTashkentDay(now.getTime());
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const revenue = (paidAt?: Date) =>
      this.db.payment.aggregate({ where: { ...REAL_PAID, ...(paidAt ? { paidAt: { gte: paidAt } } : {}) }, _sum: { amount: true } }).then((r) => r._sum.amount ?? 0);
    const aiCost = (at: Date) => this.db.llmCall.aggregate({ where: { at: { gte: at } }, _sum: { costUsd: true } }).then((r) => r._sum.costUsd ?? 0);
    const negotiations = (createdAt: Date) => this.db.negotiation.count({ where: { deletedAt: null, createdAt: { gte: createdAt } } });
    const [revToday, rev30, revAll, subs, testPaid, users, newUsers, businesses, negToday, neg30, ordersToday, costToday, cost30, accounts] = await Promise.all([
      revenue(today), revenue(d30), revenue(),
      this.db.payment.findMany({ where: { ...REAL_PAID, kind: 'subscription' }, select: { amount: true, plan: true, ownerType: true, ownerId: true, businessId: true } }),
      this.db.payment.count({ where: { status: 'paid', isTest: true, deletedAt: null } }),
      this.db.user.count({ where: { deletedAt: null } }),
      this.db.user.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      this.db.business.count({ where: { deletedAt: null } }),
      negotiations(today), negotiations(d30),
      this.db.order.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      aiCost(today), aiCost(d30),
      this.db.planAccount.findMany({ where: { deletedAt: null, expiresAt: { gt: now }, plan: { in: ['pro', 'max'] } }, select: { ownerType: true, ownerId: true, plan: true } }),
    ]);
    // Paying = active plan AND at least one real paid subscription of that owner.
    const payers = new Set(subs.map((p) => paymentOwner(p)).filter((o) => o !== null).map((o) => `${o.ownerType}:${o.ownerId}`));
    const paying = accounts.filter((a) => payers.has(`${a.ownerType}:${a.ownerId}`));
    const introCount = subs.filter(isIntro).length;
    const { used, cap } = this.agents.llm.globalTokens(now);
    return {
      revenue: { today: revToday, days30: rev30, all: revAll },
      payingClients: paying.length,
      byPlan: { pro: paying.filter((a) => a.plan === 'pro').length, max: paying.filter((a) => a.plan === 'max').length },
      paidSubscriptions: { intro: introCount, full: subs.length - introCount },
      testPaymentsPaid: testPaid,
      users: { total: users, newToday: newUsers },
      businesses,
      negotiations: { today: negToday, days30: neg30 },
      ordersToday,
      aiCostUsd: { today: costToday, days30: cost30 },
      globalTokens: { usedToday: used, cap },
    };
  }

  clients(f: ClientFilter): Promise<AdminPage<AdminClient>> {
    return listClients(this.db, f);
  }

  async payments(f: PaymentFilter): Promise<AdminPage<AdminPayment>> {
    const test = ['test', '1', 'true'].includes(f.test ?? '') ? true : ['real', '0', 'false'].includes(f.test ?? '') ? false : undefined;
    const rows = await this.db.payment.findMany({
      where: { deletedAt: null, ...(f.status ? { status: f.status } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(test !== undefined ? { isTest: test } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAYMENTS_SCAN,
    });
    const orderIds = rows.filter((p) => p.kind === 'order').map((p) => p.orderId);
    const orders = orderIds.length
      ? await this.db.order.findMany({ where: { id: { in: orderIds }, deletedAt: null }, select: { id: true, businessId: true, userId: true, total: true } })
      : [];
    const orderOf = new Map(orders.map((o) => [o.id, o]));
    const owners = rows.map((p) => (p.kind === 'subscription' ? paymentOwner(p) : null));
    const userIds = [...owners.filter((o) => o?.ownerType === 'user').map((o) => o?.ownerId ?? ''), ...orders.map((o) => o.userId)];
    const bizIds = [...owners.filter((o) => o?.ownerType === 'business').map((o) => o?.ownerId ?? ''), ...orders.map((o) => o.businessId), ...rows.map((p) => p.businessId ?? '')];
    const [users, businesses] = await Promise.all([usersById(this.db, userIds), businessesById(this.db, bizIds.filter(Boolean))]);

    const list: AdminPayment[] = rows.map((p, i) => {
      const order = orderOf.get(p.orderId);
      const owner = owners[i] ?? (order ? { ownerType: 'user' as BillingOwnerType, ownerId: order.userId } : null);
      const who = owner ? (owner.ownerType === 'user' ? users.get(owner.ownerId) : businesses.get(owner.ownerId)) : undefined;
      const bizId = order?.businessId ?? p.businessId;
      const biz = bizId ? businesses.get(bizId) : undefined;
      return {
        id: p.id, orderId: p.orderId, kind: p.kind === 'subscription' ? 'subscription' : 'order', plan: p.plan, amount: p.amount, status: p.status,
        isTest: p.isTest, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null, billId: p.billId,
        payer: owner ? { type: owner.ownerType, id: owner.ownerId, name: who?.name ?? null, phone: who?.phone ?? null } : null,
        business: bizId && biz ? { id: bizId, name: biz.name } : null,
        orderTotal: order?.total ?? null,
      };
    });
    const found = f.q ? list.filter((p) => matches(f.q ?? '', p.orderId, p.billId, p.payer?.name ?? null, p.payer?.phone ?? null, p.business?.name ?? null)) : list;
    const { limit, offset } = page(f.limit, f.offset);
    return { total: found.length, rows: found.slice(offset, offset + limit) };
  }
}
