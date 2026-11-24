import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

interface TezCheckBillResponse {
  billId?: string;
  payUrl?: string;
  link?: string;
}

export interface TezCheckWebhookBody {
  billId: string;
  status: string;
  amount?: number;
}

const TEZCHECK_BASE_URL = process.env.TEZCHECK_BASE_URL ?? 'https://api.tezcheck.uz';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Incoming payments only.
 *
 * There is deliberately no refund, payout or withdraw method in this service —
 * see ARCHITECTURE section 1. Do not add one: the team rule is that such a code
 * path must not exist at all, not merely be disabled.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createBill(orderId: string, amount: number): Promise<Payment> {
    if (amount <= 0) throw new BadRequestException('amount must be positive');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
    });
    if (!order) throw new NotFoundException('order not found');

    const apiKey = process.env.TEZCHECK_API_KEY;
    const bill = apiKey
      ? await this.createRemoteBill(orderId, amount, apiKey)
      : this.createTestBill(orderId);

    return this.prisma.payment.create({
      data: {
        orderId,
        provider: 'tezcheck',
        billId: bill.billId,
        link: bill.link,
        amount,
        status: 'pending',
      },
    });
  }

  /** Verifies the signature, then marks the order paid exactly once. */
  async handleWebhook(
    body: TezCheckWebhookBody,
    signature: string | undefined,
    rawBody: string,
  ): Promise<{ applied: boolean }> {
    const secret = process.env.TEZCHECK_WEBHOOK_SECRET;
    if (secret) {
      if (!signature || !this.signatureMatches(rawBody, signature, secret)) {
        throw new BadRequestException('invalid webhook signature');
      }
    } else {
      this.logger.warn('TEZCHECK_WEBHOOK_SECRET is not set — signature not verified (local only)');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { billId: body.billId, isDeleted: false },
    });
    if (!payment) throw new NotFoundException('payment not found');

    // Idempotent: a repeated callback for an already paid bill changes nothing.
    if (payment.status === 'paid') return { applied: false };

    const paid = body.status.toLowerCase() === 'paid';
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: paid ? 'paid' : 'failed', webhookRaw: body as unknown as object },
      }),
      ...(paid
        ? [
            this.prisma.order.update({
              where: { id: payment.orderId },
              data: { status: 'paid' },
            }),
          ]
        : []),
    ]);

    return { applied: true };
  }

  private async createRemoteBill(
    orderId: string,
    amount: number,
    apiKey: string,
  ): Promise<{ billId: string; link: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${TEZCHECK_BASE_URL}/v1/bills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ orderId, amount, currency: 'UZS' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`tezcheck create-bill failed with status ${response.status}`);
        return this.createTestBill(orderId);
      }

      const data = (await response.json()) as TezCheckBillResponse;
      const billId = data.billId ?? randomUUID();
      const link = data.payUrl ?? data.link;
      if (!link) return this.createTestBill(orderId);
      return { billId, link };
    } catch (error) {
      this.logger.warn(`tezcheck unreachable: ${(error as Error).message}`);
      return this.createTestBill(orderId);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Local test provider: a bill that can be marked paid through the webhook. */
  private createTestBill(orderId: string): { billId: string; link: string } {
    const billId = `test-${randomUUID()}`;
    const base = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
    return { billId, link: `${base}/pay/${billId}?order=${orderId}` };
  }

  private signatureMatches(rawBody: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const given = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    const want = Buffer.from(expected, 'hex');
    return given.length === want.length && timingSafeEqual(given, want);
  }
}
