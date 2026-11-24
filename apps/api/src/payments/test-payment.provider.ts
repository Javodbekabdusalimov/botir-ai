// TEST payment links (no real money): used until the real TezCheck module is wired in. Clearly labeled in the UI.
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Payment } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import type { PayableOrder, PaymentLink, PaymentLinkProvider } from './payment-link';

@Injectable()
export class TestPaymentLinkProvider implements PaymentLinkProvider {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async createPaymentLink(order: PayableOrder): Promise<PaymentLink> {
    const existing = await this.findByOrder(order.id);
    if (existing) return { payUrl: existing.link, billId: existing.billId };
    const base = (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
    const p = await this.db.payment.create({
      data: {
        orderId: order.id, kind: order.kind ?? 'order', businessId: order.businessId, billId: `test-${randomUUID()}`, link: `${base}/pay/test/${order.id}`, amount: order.total, isTest: true,
      },
    });
    return { payUrl: p.link, billId: p.billId };
  }

  findByOrder(orderId: string): Promise<Payment | null> {
    return this.db.payment.findFirst({ where: { orderId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }
}
