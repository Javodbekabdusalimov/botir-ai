import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { User as DbUser } from '@prisma/client';
import type { BusinessPlanStatus, SubscribeDto, SubscriptionResult } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { assertBusinessOwner } from '../auth/ownership';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { PAYMENT_LINK, type PaymentLinkProvider } from './payment-link';
import { PaymentPoller } from './payment-poller.service';
import { planById, plans, planStatus } from './plans';

const REUSE_PENDING_MS = 30 * 60_000;

@Controller()
export class PaymentsController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PAYMENT_LINK) private readonly payments: PaymentLinkProvider,
    @Inject(PaymentPoller) private readonly poller: PaymentPoller,
  ) {}

  @Get('plans')
  list() {
    return ok(plans());
  }

  /** orderId = Order.id or a subscription paymentRef. Polling: checks TezCheck (cached 3 s). */
  @Get('payments/:orderId/status')
  async status(@Param('orderId') orderId: string) {
    return ok(await this.poller.status(orderId));
  }

  /** Owner's subscription: effective plan, expiry, intro/full price and what the next Pro month costs. */
  @Get('businesses/:id/plan')
  @Auth()
  async businessPlan(@Param('id') id: string, @CurrentUser() user: DbUser) {
    const b = await assertBusinessOwner(this.db, id, user);
    return ok<BusinessPlanStatus>(planStatus(b, await this.paidSubscriptions(id)));
  }

  /** Owner buys Pro → TezCheck bill (incoming only). Activation is automatic when the poller sees it paid. */
  @Post('businesses/:id/subscription')
  @Auth()
  async subscribe(@Param('id') id: string, @Body() dto: Partial<SubscribeDto>, @CurrentUser() user: DbUser) {
    const plan = dto?.plan === 'pro' ? planById('pro') : undefined;
    if (!plan) throw new BadRequestException("plan must be 'pro'");
    const b = await assertBusinessOwner(this.db, id, user);
    const { nextPrice: price, introAvailable } = planStatus(b, await this.paidSubscriptions(id));
    // Double click → same pending bill (same price), not a second one.
    const pending = await this.db.payment.findFirst({
      where: {
        businessId: id, kind: 'subscription', status: 'pending', amount: price, deletedAt: null,
        createdAt: { gte: new Date(Date.now() - REUSE_PENDING_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ref = pending?.orderId ?? `sub-${randomUUID()}`;
    const link = await this.payments.createPaymentLink({
      id: ref, businessId: id, total: price, kind: 'subscription',
      title: `Botir ${plan.name} — ${introAvailable ? 'birinchi oy' : '1 oy'} (${b.name})`,
    });
    return ok<SubscriptionResult>({ paymentRef: ref, payUrl: link.payUrl, amount: price });
  }

  /** Paid Pro months in the current payment mode: TEST payments never use up the real intro price. */
  private paidSubscriptions(businessId: string): Promise<number> {
    const isTest = !process.env.TEZCHECK_API_KEY;
    return this.db.payment.count({ where: { businessId, kind: 'subscription', status: 'paid', isTest, deletedAt: null } });
  }
}
