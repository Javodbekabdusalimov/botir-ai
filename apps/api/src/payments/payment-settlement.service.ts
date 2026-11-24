// pending → paid, exactly once. Order → status 'paid'; subscription → business on Pro (+30 days, +AI credits).
// Then the business owner is notified (Telegram bot if linked; always a log line).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { TgService } from '../tg/tg.service';
import { planById } from './plans';

const DAY_MS = 86_400_000;

@Injectable()
export class PaymentSettlement {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(TgService) private readonly tg: TgService,
  ) {}

  /** Idempotent: returns true only for the call that flipped the payment to paid. */
  async markPaid(p: Payment, paidAt = new Date()): Promise<boolean> {
    const pro = planById('pro');
    const flipped = await this.db.$transaction(async (tx) => {
      const r = await tx.payment.updateMany({ where: { id: p.id, status: { not: 'paid' } }, data: { status: 'paid', paidAt } });
      if (r.count === 0) return false;
      if (p.kind === 'subscription' && p.businessId && pro) {
        const b = await tx.business.findUniqueOrThrow({ where: { id: p.businessId } });
        const from = b.plan === 'pro' && b.planUntil && b.planUntil > paidAt ? b.planUntil : paidAt;
        await tx.business.update({
          where: { id: b.id },
          data: { plan: 'pro', planUntil: new Date(from.getTime() + pro.periodDays * DAY_MS), aiCredits: { increment: pro.aiCredits } },
        });
      } else if (p.kind === 'order') {
        await tx.order.update({ where: { id: p.orderId }, data: { status: 'paid' } });
      }
      return true;
    });
    if (flipped) await this.notify(p);
    return flipped;
  }

  private async notify(p: Payment): Promise<void> {
    const businessId = p.businessId ?? (await this.db.order.findUnique({ where: { id: p.orderId } }))?.businessId;
    const amount = `${p.amount.toLocaleString('ru-RU')} so'm`;
    const text = p.kind === 'subscription'
      ? `✅ Botir Pro faollashtirildi (${amount}). Rahmat!`
      : `💰 To'lov keldi: buyurtma #${p.orderId.slice(0, 8)} — ${amount}`;
    this.logger.log(`${p.kind} ${p.orderId} PAID ${amount}${p.isTest ? ' (TEST)' : ''} business=${businessId ?? '-'}`);
    if (!businessId) return;
    const sent = await this.tg.notifyBusinessOwner(businessId, text).catch(() => false);
    if (!sent) this.logger.log(`owner of ${businessId} not notified via Telegram (bot off or owner not linked)`);
  }
}
