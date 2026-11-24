import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { lastValueFrom, timeout, toArray } from 'rxjs';
import type { NegotiationEvent, UserAction } from '@botir/shared';
import { errMsg } from '../common/http';
import { PrismaActionStore } from '../db/prisma-action-store';
import { PrismaService } from '../db/prisma.service';
import { NegotiationsService } from '../negotiations/negotiations.service';
import { ActionGate, parseSelfCommand, type SelfCommand, type TgAction } from '../tg-connect';
import { TgService } from './tg.service';

// B2C: the user's own Telegram. Saved Messages → personal agent; AI writes to others only after approve.

const RESULT_WAIT_MS = 5 * 60 * 1000;

const toShared = (a: TgAction): UserAction => ({
  id: a.id, chatId: a.chatId, peerTitle: a.peerTitle, text: a.text, status: a.status,
  ...(a.reason ? { reason: a.reason } : {}), createdAt: a.createdAt,
});

@Injectable()
export class TgUserService implements OnModuleInit {
  private readonly logger = new Logger('TgUser');
  private readonly gate: ActionGate;
  private readonly web = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PrismaActionStore) private readonly actions: PrismaActionStore,
    @Inject(TgService) private readonly tg: TgService,
    @Inject(NegotiationsService) private readonly negotiations: NegotiationsService,
  ) {
    this.gate = new ActionGate(actions, (accountId, chatId, text) => this.tg.sendAsOwner(accountId, chatId, text));
  }

  onModuleInit(): void {
    this.tg.setSelfHandler((accountId, text) => this.onSelf(accountId, text));
  }

  async pending(userId: string): Promise<UserAction[]> {
    return (await this.actions.listPending(userId)).map(toShared);
  }

  async decide(userId: string, id: string, approve: boolean): Promise<UserAction> {
    const res = approve ? await this.gate.approve(userId, id) : await this.gate.reject(userId, id);
    if (!res.ok) throw new BadRequestException(res.reason);
    return toShared(res.action);
  }

  private async onSelf(accountId: string, text: string): Promise<void> {
    const cmd = parseSelfCommand(text);
    if (!cmd) return;
    const account = await this.db.tgAccount.findFirst({ where: { id: accountId, ownerType: 'user', deletedAt: null } });
    if (!account?.userId) return;
    try {
      const reply = await this.handle(account.userId, accountId, cmd);
      if (reply) await this.tg.sendToSelf(accountId, reply);
    } catch (e) {
      this.logger.error(`saved-messages ${accountId}: ${errMsg(e)}`);
    }
  }

  private async handle(userId: string, accountId: string, cmd: SelfCommand): Promise<string> {
    if (cmd.kind === 'approve' || cmd.kind === 'reject') {
      const [latest] = await this.actions.listPending(userId);
      if (!latest) return ''; // plain "ha" with nothing pending is just a note
      const approve = cmd.kind === 'approve';
      const res = approve ? await this.gate.approve(userId, latest.id) : await this.gate.reject(userId, latest.id);
      if (!res.ok) return `⛔ Yuborilmadi: ${res.reason}`;
      return approve ? `✅ ${latest.peerTitle}ga yuborildi.` : '❎ Bekor qilindi, hech narsa yuborilmadi.';
    }
    if (cmd.kind === 'write') {
      const chat = await this.db.chat.findFirst({
        where: { accountId, title: { contains: cmd.name }, deletedAt: null }, orderBy: { lastMessageAt: 'desc' },
      });
      if (!chat) return `🤖 "${cmd.name}" topilmadi (u avval sizga yozgan bo'lishi kerak).`;
      await this.gate.propose({ userId, accountId, chatId: chat.id, peerTitle: chat.title, text: cmd.text });
      return `🤖 ${chat.title}ga yuboraymi?\n\n«${cmd.text}»\n\nJavob: ha / yo'q (yoki saytda: ${this.web}/me/actions)`;
    }
    const r = await this.negotiations.request(userId, cmd.text);
    void this.reportResult(accountId, r.negotiationId);
    return `🤖 Qabul qildim! Agentlarim bizneslar bilan gaplashmoqda.\nJonli kuzating: ${this.web}/live/${r.negotiationId}`;
  }

  /** When the negotiation finishes: best offers + confirm links into Saved Messages. */
  private async reportResult(accountId: string, negId: string): Promise<void> {
    try {
      const events = await lastValueFrom(this.negotiations.stream(negId).pipe(timeout(RESULT_WAIT_MS), toArray()));
      const offers = events.filter((e): e is Extract<NegotiationEvent, { type: 'best_offer' }> => e.type === 'best_offer');
      const live = `${this.web}/live/${negId}`;
      const text = offers.length
        ? ['🤖 Natija:', ...offers.map((o) =>
            `• ${o.businessName}: ${o.offer.price.toLocaleString('ru-RU')} so'm${o.offer.discountPct ? ` (−${o.offer.discountPct}%)` : ''}\n  Tasdiqlash: ${live}?confirm=${o.businessId}`,
          )].join('\n')
        : `🤖 Mos taklif topilmadi. Batafsil: ${live}`;
      await this.tg.sendToSelf(accountId, text);
    } catch (e) {
      this.logger.warn(`result ${negId}: ${errMsg(e)}`);
    }
  }
}
