import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { User as DbUser } from '@prisma/client';
import type { SubscribeDto, SubscriptionResult } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { PAYMENT_LINK, type PaymentLinkProvider } from './payment-link';
import { PaymentPoller } from './payment-poller.service';
import { planById, plans } from './plans';

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

  /** Owner buys Pro → TezCheck bill (incoming only). Activation is automatic when the poller sees it paid. */
  @Post('businesses/:id/subscription')
  @Auth()
  async subscribe(@Param('id') id: string, @Body() dto: Partial<SubscribeDto>, @CurrentUser() user: DbUser) {
    const plan = dto?.plan === 'pro' ? planById('pro') : undefined;
    if (!plan) throw new BadRequestException("plan must be 'pro'");
    const b = await this.db.business.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw new NotFoundException('business not found');
    if (b.ownerUserId !== user.id && user.businessId !== b.id) throw new ForbiddenException('Faqat biznes egasi obuna bo‘la oladi');
    // Double click → same pending bill (same price), not a second one.
    const pending = await this.db.payment.findFirst({
      where: {
        businessId: id, kind: 'subscription', status: 'pending', amount: plan.price, deletedAt: null,
        createdAt: { gte: new Date(Date.now() - REUSE_PENDING_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ref = pending?.orderId ?? `sub-${randomUUID()}`;
    const link = await this.payments.createPaymentLink({
      id: ref, businessId: id, total: plan.price, kind: 'subscription', title: `Botir ${plan.name} — 1 oy (${b.name})`,
    });
    return ok<SubscriptionResult>({ paymentRef: ref, payUrl: link.payUrl, amount: plan.price });
  }
}
