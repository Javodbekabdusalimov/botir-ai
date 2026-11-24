// TEST payment links (no real money): used until the real TezCheck module is wired in. Clearly labeled in the UI.
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Payment } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import type { PayableOrder, PaymentLink, PaymentLinkProvider } from './payment-link';

@Injectable()
export class TestPaymentLinkProvider implements PaymentLinkProvider {
  private readonly logger = new Logger('TestPayments');

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async createPaymentLink(order: PayableOrder): Promise<PaymentLink> {
    const existing = await this.findByOrder(order.id);
    if (existing) return { payUrl: existing.link, billId: existing.billId };
    const base = (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
    const p = await this.db.payment.create({
      data: { orderId: order.id, billId: `test-${randomUUID()}`, link: `${base}/pay/test/${order.id}`, amount: order.total, isTest: true },
    });
    return { payUrl: p.link, billId: p.billId };
  }

  findByOrder(orderId: string): Promise<Payment | null> {
    return this.db.payment.findFirst({ where: { orderId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  /** The TEST page's "pay" button. Only isTest payments; idempotent. */
  async simulatePaid(orderId: string): Promise<Payment> {
    const p = await this.db.payment.findFirst({ where: { orderId, isTest: true, deletedAt: null } });
    if (!p) throw new NotFoundException('test payment not found');
    if (p.status === 'paid') return p;
    const [updated] = await this.db.$transaction([
      this.db.payment.update({ where: { id: p.id }, data: { status: 'paid', paidAt: new Date() } }),
      this.db.order.update({ where: { id: orderId }, data: { status: 'paid' } }),
    ]);
    this.logger.log(`order ${orderId} marked paid (TEST)`);
    return updated;
  }
}
