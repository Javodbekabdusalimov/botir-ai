// Plans and token ledger. FREE = no row / expired row. PRO/MAX = PlanAccount until expiresAt, with a DAILY token allowance
// (DailyUsage, day = Asia/Tashkent calendar day). Debit failures never break an AI call (see onModuleInit).
import { HttpException, HttpStatus, Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, User as DbUser } from '@prisma/client';
import type { BillingMe, BillingSubscribeDto, SubscriptionResult } from '@botir/shared';
import { AuthService } from '../auth/auth.service';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { startOfTashkentDay } from '../negotiations/request-limits';
import { PAYMENT_LINK, type PaymentLinkProvider } from '../payments/payment-link';
import { dailyTokens, isPaidPlan, type EffectivePlan, type PaidPlan } from '../payments/plans';
import type { BillingOwner } from './billing-context';
import { billingPrices, freeDailyRequests, PLAN_PERIOD_DAYS, planPrice, tokensForCost } from './billing-plans';

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const TASHKENT_OFFSET_MS = 5 * 3_600_000; // UTC+5, no DST
const REUSE_PENDING_MS = 30 * 60_000;

export type GateKind = 'agent' | 'telegram';

export const MSG = {
  needProAgent: "Bu imkoniyat Pro tarifida: agent siz uchun savdolashadi va buyurtma beradi",
  needProTelegram: 'Bu imkoniyat Pro tarifida: Telegram akkauntingizni ulash',
  tokensOut: 'Bugungi tokenlar tugadi, ertaga 00:00 da yangilanadi',
  freeOut: (limit: number): string => `Bugungi ${limit} ta bepul so'rov tugadi`,
} as const;

/** Tashkent calendar day key, e.g. "2026-11-25". */
export const dayKey = (now: Date): string => new Date(startOfTashkentDay(now.getTime()).getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
export const nextReset = (now: Date): Date => new Date(startOfTashkentDay(now.getTime()).getTime() + DAY_MS);

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger('Billing');

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PAYMENT_LINK) private readonly payments: PaymentLinkProvider,
  ) {}

  onModuleInit(): void {
    this.agents.llm.setOnCost((owner, costUsd) => this.debit(owner, costUsd));
  }

  /** Bearer user (business role → their business) or the guest id from the body. Never throws: a bad token is a guest. */
  async resolveOwner(authorization: string | undefined, guestId?: string): Promise<BillingOwner> {
    const [scheme, token] = (authorization ?? '').split(' ');
    const user = scheme === 'Bearer' && token ? await this.auth.userFromToken(token).catch(() => null) : null;
    if (user) return ownerOfUser(user);
    const id = typeof guestId === 'string' ? guestId.trim().slice(0, 100) : '';
    // A registered user's id without their token must not bill (or read) that user's account.
    const registered = id ? await this.db.user.findFirst({ where: { id }, select: { id: true } }) : null;
    return { ownerType: 'user', ownerId: id && !registered ? id : 'anonymous' };
  }

  /** Like resolveOwner, but a registered id without a token is a 401 (same rule as POST /agent/request). */
  async requireOwner(authorization: string | undefined, guestId?: string): Promise<BillingOwner> {
    const owner = await this.resolveOwner(authorization, guestId);
    const id = typeof guestId === 'string' ? guestId.trim() : '';
    if (owner.ownerId === 'anonymous' && id && id !== 'anonymous') throw new UnauthorizedException('Bu foydalanuvchi nomidan so‘rov uchun kirish kerak');
    return owner;
  }

  async effectivePlan(owner: BillingOwner, now = new Date()): Promise<{ plan: EffectivePlan; expiresAt: Date | null }> {
    const row = await this.db.planAccount.findFirst({ where: { ...key(owner), deletedAt: null } });
    const plan = row && isPaidPlan(row.plan) && row.expiresAt && row.expiresAt > now ? row.plan : 'free';
    return { plan, expiresAt: row?.expiresAt ?? null };
  }

  async status(owner: BillingOwner, now = new Date()): Promise<BillingMe> {
    const [{ plan, expiresAt }, usage, introAvailable] = await Promise.all([
      this.effectivePlan(owner, now),
      this.db.dailyUsage.findFirst({ where: { ...key(owner), day: dayKey(now), deletedAt: null } }),
      this.introAvailable(owner),
    ]);
    const limit = dailyTokens(plan);
    const tokensToday = usage?.tokensUsed ?? 0;
    return {
      ...owner,
      plan,
      expiresAt: expiresAt?.toISOString() ?? null,
      tokensToday,
      tokensLeftToday: Math.max(0, limit - tokensToday),
      dailyTokens: limit,
      freeLeftToday: plan === 'free' ? Math.max(0, freeDailyRequests() - (usage?.requests ?? 0)) : 0,
      resetsAt: nextReset(now).toISOString(),
      introAvailable,
      prices: billingPrices(),
    };
  }

  /** null = allowed. Otherwise the Uzbek 402 message. PRO/MAX with tokens left today are allowed. */
  async gate(owner: BillingOwner, kind: GateKind, now = new Date()): Promise<string | null> {
    const s = await this.status(owner, now);
    if (s.plan === 'free') return kind === 'agent' ? MSG.needProAgent : MSG.needProTelegram;
    return s.tokensLeftToday > 0 ? null : MSG.tokensOut;
  }

  /** Records the AI cost of a call: tokens = ceil(costUsd / $0.001). Never throws. */
  async debit(owner: BillingOwner, costUsd: number, now = new Date()): Promise<void> {
    const tokens = tokensForCost(costUsd);
    if (tokens === 0) return;
    try {
      await this.db.dailyUsage.upsert({
        where: { ownerType_ownerId_day: { ...owner, day: dayKey(now) } },
        create: { ...owner, day: dayKey(now), tokensUsed: tokens },
        update: { tokensUsed: { increment: tokens } },
      });
    } catch (e) {
      this.logger.warn(`debit ${owner.ownerType}:${owner.ownerId} ${tokens} tokens failed: ${errMsg(e)}`);
    }
  }

  /** FREE daily search quota: true = one request taken, false = the day's quota is used up. Atomic per owner/day. */
  async takeFreeRequest(owner: BillingOwner, now = new Date()): Promise<boolean> {
    const where = { ...key(owner), day: dayKey(now) };
    await this.db.dailyUsage.upsert({ where: { ownerType_ownerId_day: { ...owner, day: where.day } }, create: { ...where }, update: {} });
    const r = await this.db.dailyUsage.updateMany({ where: { ...where, requests: { lt: freeDailyRequests() } }, data: { requests: { increment: 1 } } });
    return r.count === 1;
  }

  /** POST /agent/search quota: PRO/MAX are unlimited here (tokens are debited from the AI cost), FREE gets N per day. */
  async assertSearchAllowed(owner: BillingOwner, now = new Date()): Promise<void> {
    const { plan } = await this.effectivePlan(owner, now);
    if (plan === 'free') {
      if (!(await this.takeFreeRequest(owner, now))) throw new HttpException(MSG.freeOut(freeDailyRequests()), HttpStatus.TOO_MANY_REQUESTS);
      return;
    }
    if ((await this.gate(owner, 'agent', now)) !== null) throw new HttpException(MSG.tokensOut, HttpStatus.PAYMENT_REQUIRED);
  }

  /** Paid → plan for 30 days. Same plan still running: extends from its end; otherwise starts at paidAt. */
  async activate(db: Db, owner: BillingOwner, plan: PaidPlan, paidAt = new Date()): Promise<Date> {
    const row = await db.planAccount.findFirst({ where: { ...key(owner), deletedAt: null } });
    const extend = row?.plan === plan && row.expiresAt && row.expiresAt > paidAt;
    const expiresAt = new Date((extend && row.expiresAt ? row.expiresAt : paidAt).getTime() + PLAN_PERIOD_DAYS * DAY_MS);
    await db.planAccount.upsert({
      where: { ownerType_ownerId: { ...owner } },
      create: { ...owner, plan, expiresAt },
      update: { plan, expiresAt, deletedAt: null },
    });
    return expiresAt;
  }

  /** Called inside PaymentSettlement's transaction for a freshly paid subscription. TEST payments never activate anything. */
  async onSubscriptionPaid(db: Db, p: { id: string; isTest: boolean; ownerType: string | null; ownerId: string | null; plan: string | null; businessId: string | null }, paidAt: Date): Promise<void> {
    const owner = paymentOwner(p);
    if (!owner) return;
    if (p.isTest) {
      this.logger.warn(`payment ${p.id} is a TEST payment: plan NOT activated for ${owner.ownerType}:${owner.ownerId}`);
      return;
    }
    const plan = isPaidPlan(p.plan) ? p.plan : 'pro';
    const until = await this.activate(db, owner, plan, paidAt);
    this.logger.log(`${plan} activated for ${owner.ownerType}:${owner.ownerId} until ${until.toISOString()}`);
  }

  /** POST /billing/subscribe: TezCheck/TEST bill (incoming money only). Activation happens when the poller sees it paid. */
  async subscribe(user: DbUser, dto: Partial<BillingSubscribeDto>): Promise<SubscriptionResult> {
    if (!isPaidPlan(dto?.plan)) throw new HttpException("plan 'pro' yoki 'max' bo'lishi kerak", HttpStatus.BAD_REQUEST);
    const plan = dto.plan;
    const owner = ownerOfUser(user);
    const intro = plan === 'pro' && (await this.introAvailable(owner));
    const price = planPrice(plan, intro);
    // Double click → the same pending bill, not a second one.
    const pending = await this.db.payment.findFirst({
      where: {
        ...ownerWhere(owner), kind: 'subscription', status: 'pending', plan, amount: price, deletedAt: null,
        createdAt: { gte: new Date(Date.now() - REUSE_PENDING_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ref = pending?.orderId ?? `sub-${randomUUID()}`;
    const link = await this.payments.createPaymentLink({
      id: ref, businessId: owner.ownerType === 'business' ? owner.ownerId : '', total: price, kind: 'subscription',
      title: `Botir ${plan.toUpperCase()} — ${intro ? 'birinchi oy' : '30 kun'}`,
    });
    await this.db.payment.updateMany({
      where: { billId: link.billId },
      data: { ownerType: owner.ownerType, ownerId: owner.ownerId, plan, businessId: owner.ownerType === 'business' ? owner.ownerId : null },
    });
    return { paymentRef: ref, payUrl: link.payUrl, amount: price };
  }

  /** The first PRO month is cheap once per account; only real (non-test) paid PRO payments use it up. */
  private async introAvailable(owner: BillingOwner): Promise<boolean> {
    const paid = await this.db.payment.count({
      where: { AND: [ownerWhere(owner), { OR: [{ plan: 'pro' }, { plan: null }] }], kind: 'subscription', status: 'paid', isTest: false, deletedAt: null },
    });
    return paid === 0;
  }
}

const key = (o: BillingOwner): BillingOwner => ({ ownerType: o.ownerType, ownerId: o.ownerId });

/** Business owners (role business with a business) bill their business; everybody else bills themselves. */
export const ownerOfUser = (u: Pick<DbUser, 'id' | 'role' | 'businessId'>): BillingOwner =>
  u.role === 'business' && u.businessId ? { ownerType: 'business', ownerId: u.businessId } : { ownerType: 'user', ownerId: u.id };

/** Payments of an owner, including legacy business subscriptions that only carry businessId. */
const ownerWhere = (o: BillingOwner): Prisma.PaymentWhereInput =>
  o.ownerType === 'business' ? { OR: [{ ownerType: 'business', ownerId: o.ownerId }, { ownerType: null, businessId: o.ownerId }] } : { ownerType: 'user', ownerId: o.ownerId };

export function paymentOwner(p: { ownerType: string | null; ownerId: string | null; businessId: string | null }): BillingOwner | null {
  if ((p.ownerType === 'user' || p.ownerType === 'business') && p.ownerId) return { ownerType: p.ownerType, ownerId: p.ownerId };
  return p.businessId ? { ownerType: 'business', ownerId: p.businessId } : null; // legacy business subscription
}
