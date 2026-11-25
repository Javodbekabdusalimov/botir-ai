// Real payment links via TezCheck (incoming only). Bound to PAYMENT_LINK when TEZCHECK_API_KEY is set.
// Status is NOT pushed to us (no webhook): PaymentPoller reads it. external_reference = order id / subscription ref.
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import type { PayableOrder, PaymentLink, PaymentLinkProvider } from './payment-link';
import { TestPaymentLinkProvider } from './test-payment.provider';
import { TezcheckClient } from './tezcheck.client';

@Injectable()
export class TezcheckPaymentLinkProvider implements PaymentLinkProvider {
  private readonly logger = new Logger('TezCheck');

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(TestPaymentLinkProvider) private readonly test: TestPaymentLinkProvider,
  ) {}

  /** Idempotent per order: DB first, then TezCheck Idempotency-Key `botir-<orderId>` (same bill on retry/race). */
  async createPaymentLink(order: PayableOrder): Promise<PaymentLink> {
    // The configured cash desk is Botir's own and payouts do not exist (invariant 3): only the subscription is Botir's
    // money. Customer orders stay on TEST links until each business has its own cash desk.
    if ((order.kind ?? 'order') !== 'subscription') return this.test.createPaymentLink(order);
    const existing = await this.findLive(order.id);
    if (existing) return { payUrl: existing.link, billId: existing.billId };
    const client = TezcheckClient.fromEnv();
    if (!client) throw new ServiceUnavailableException('TezCheck is not configured');
    const amount = Math.round(order.total);
    const created = await client.createBill({
      amountMinor: amount * 100,
      title: (order.title ?? `Life Assistant buyurtma #${order.id.slice(0, 8)}`).slice(0, 191),
      externalReference: order.id,
      idempotencyKey: `botir-${order.id}`,
    });
    try {
      await this.db.payment.create({
        data: {
          orderId: order.id, kind: order.kind ?? 'order', businessId: order.businessId, provider: 'tezcheck',
          billId: created.bill.id, link: created.payment_url, amount,
        },
      });
      this.logger.log(`bill ${created.bill.id} created for ${order.kind ?? 'order'} ${order.id} (${amount} so'm)`);
    } catch (e) {
      // Concurrent confirm got the same (idempotent) bill and saved it first.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { payUrl: created.payment_url, billId: created.bill.id };
  }

  private findLive(orderId: string) {
    return this.db.payment.findFirst({ where: { orderId, provider: 'tezcheck', isTest: false, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }
}
