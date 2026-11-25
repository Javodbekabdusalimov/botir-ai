// Polling is the source of truth (no webhook: the cash desk's webhook belongs to another app).
// GET /payments/:orderId/status reads TezCheck (≤1 call / 3 s per payment); a 5 s background loop
// re-checks pending TezCheck payments for 30 min after creation.
import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import type { PaymentStatusResult } from '@botir/shared';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { PaymentSettlement } from './payment-settlement.service';
import { TezcheckClient } from './tezcheck.client';

const CACHE_MS = 3_000;
const TICK_MS = 5_000;
const WINDOW_MS = 30 * 60_000;
const DEAD_BILL_STATES = new Set(['expired', 'revoked']);

@Injectable()
export class PaymentPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PaymentPoller');
  private readonly lastCheck = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PaymentSettlement) private readonly settlement: PaymentSettlement,
  ) {}

  onModuleInit(): void {
    if (!TezcheckClient.fromEnv()) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(`polling pending TezCheck payments every ${TICK_MS / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async status(orderId: string): Promise<PaymentStatusResult> {
    let p = await this.db.payment.findFirst({ where: { orderId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!p) throw new NotFoundException('payment not found');
    if (p.status === 'pending' && !p.isTest) {
      p = await this.refresh(p).catch((e: unknown) => {
        this.logger.warn(`status ${orderId}: ${errMsg(e)}`);
        return p as Payment;
      });
    }
    return {
      orderId: p.orderId, kind: p.kind === 'subscription' ? 'subscription' : 'order',
      status: p.status as PaymentStatusResult['status'], amount: p.amount, payUrl: p.link, isTest: p.isTest,
      ...(p.paidAt ? { paidAt: p.paidAt.toISOString() } : {}),
    };
  }

  /** Reads the bill from TezCheck and settles it. Only real money (livemode) counts unless TEZCHECK_ACCEPT_TEST=1. */
  private async refresh(p: Payment): Promise<Payment> {
    const client = TezcheckClient.fromEnv();
    if (!client || Date.now() - (this.lastCheck.get(p.id) ?? 0) < CACHE_MS) return p;
    this.lastCheck.set(p.id, Date.now());
    const { bill } = await client.readBill(p.billId);
    if (bill.paid) {
      if (bill.livemode || process.env.TEZCHECK_ACCEPT_TEST === '1') {
        await this.settlement.markPaid(p, bill.paid_at ? new Date(bill.paid_at) : new Date());
      } else {
        this.logger.warn(`bill ${p.billId} paid via TEST provider (not real money) — ignored`);
      }
    } else if (DEAD_BILL_STATES.has(bill.state)) {
      await this.db.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'expired' } });
    }
    return (await this.db.payment.findUnique({ where: { id: p.id } })) ?? p;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const pending = await this.db.payment.findMany({
        where: { status: 'pending', isTest: false, provider: 'tezcheck', deletedAt: null, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      });
      for (const p of pending) await this.refresh(p).catch((e: unknown) => this.logger.warn(`poll ${p.orderId}: ${errMsg(e)}`));
    } catch (e) {
      this.logger.warn(`poll tick: ${errMsg(e)}`);
    } finally {
      this.ticking = false;
    }
  }
}
