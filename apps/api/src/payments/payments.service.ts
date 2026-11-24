// INCOMING payments only: TezCheck create-bill + webhook. No refund/payout/withdraw code — by design.
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Payment } from '@prisma/client';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';

export interface TezcheckWebhookBody {
  billId?: string;
  bill_id?: string;
  status?: string;
}

const PAID = new Set(['paid', 'success', 'succeeded', 'completed']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** One pending/paid payment per order; creates a bill on first call. */
  async linkFor(orderId: string, amount: number): Promise<Payment> {
    const existing = await this.db.payment.findFirst({ where: { orderId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    const key = process.env.TEZCHECK_API_KEY;
    if (key) {
      try {
        const bill = await this.createTezcheckBill(key, orderId, amount);
        return this.db.payment.create({ data: { orderId, billId: bill.billId, link: bill.link, amount } });
      } catch (e) {
        this.logger.error(`TezCheck create-bill failed, falling back to TEST link: ${errMsg(e)}`);
      }
    }
    const base = (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
    return this.db.payment.create({
      data: { orderId, billId: `test-${randomUUID()}`, link: `${base}/pay/test/${orderId}`, amount, isTest: true },
    });
  }

  /**
   * TezCheck create-bill. Endpoint path and field names are configurable because the public docs
   * were not verified live: TEZCHECK_API_URL (default https://api.tezcheck.uz), TEZCHECK_BILL_PATH (default /v1/bills).
   */
  private async createTezcheckBill(key: string, orderId: string, amount: number): Promise<{ billId: string; link: string }> {
    const base = (process.env.TEZCHECK_API_URL ?? 'https://api.tezcheck.uz').replace(/\/$/, '');
    const res = await fetch(`${base}${process.env.TEZCHECK_BILL_PATH ?? '/v1/bills'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        amount,
        external_id: orderId,
        description: `Botir AI buyurtma ${orderId.slice(0, 8)}`,
        callback_url: process.env.TEZCHECK_CALLBACK_URL,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;
    const billId = String(data.id ?? data.bill_id ?? data.billId ?? '');
    const link = String(data.payment_url ?? data.url ?? data.link ?? '');
    if (!billId || !link) throw new Error('unexpected create-bill response');
    return { billId, link };
  }

  /** HMAC-SHA256(rawBody, TEZCHECK_WEBHOOK_SECRET) hex in `x-signature`. Idempotent. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, body: TezcheckWebhookBody): Promise<{ status: string }> {
    const secret = process.env.TEZCHECK_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('webhook secret is not configured');
    if (!rawBody || !signature) throw new UnauthorizedException('missing signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.replace(/^sha256=/, ''));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('bad signature');

    const billId = body.billId ?? body.bill_id;
    if (!billId) throw new BadRequestException('billId is required');
    const payment = await this.db.payment.findUnique({ where: { billId } });
    if (!payment) throw new NotFoundException('payment not found');
    const status = String(body.status ?? '').toLowerCase();
    if (!PAID.has(status)) return { status: payment.status };
    return { status: (await this.markPaid(payment)).status };
  }

  /** Demo only: the TEST link's "pay" button. Works only for isTest payments (no real money involved). */
  async simulateTestPayment(orderId: string): Promise<Payment> {
    const payment = await this.db.payment.findFirst({ where: { orderId, isTest: true, deletedAt: null } });
    if (!payment) throw new NotFoundException('test payment not found');
    return this.markPaid(payment);
  }

  async findByOrder(orderId: string): Promise<Payment | null> {
    return this.db.payment.findFirst({ where: { orderId, deletedAt: null } });
  }

  private async markPaid(payment: Payment): Promise<Payment> {
    if (payment.status === 'paid') return payment; // idempotent
    const [updated] = await this.db.$transaction([
      this.db.payment.update({ where: { id: payment.id }, data: { status: 'paid', paidAt: new Date() } }),
      this.db.order.update({ where: { id: payment.orderId }, data: { status: 'paid' } }),
    ]);
    this.logger.log(`order ${payment.orderId} paid (${payment.isTest ? 'TEST' : 'tezcheck'})`);
    return updated;
  }
}
