import { Inject, Injectable } from '@nestjs/common';
import type { UserAction as DbAction } from '@prisma/client';
import type { ActionStatus, ActionStore, NewTgAction, TgAction } from '../tg-connect';
import { PrismaService } from './prisma.service';

const toAction = (a: DbAction): TgAction => ({
  id: a.id, userId: a.userId, accountId: a.accountId, chatId: a.chatId, peerTitle: a.peerTitle, text: a.text,
  status: a.status as ActionStatus, reason: a.reason ?? undefined, createdAt: a.createdAt.toISOString(),
  ...(a.firstContact ? { firstContact: true } : {}), ...(a.externalBusinessId ? { externalBusinessId: a.externalBusinessId } : {}),
});

@Injectable()
export class PrismaActionStore implements ActionStore {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async create(a: NewTgAction): Promise<TgAction> {
    return toAction(await this.db.userAction.create({ data: a }));
  }

  async get(id: string): Promise<TgAction | undefined> {
    const a = await this.db.userAction.findFirst({ where: { id, deletedAt: null } });
    return a ? toAction(a) : undefined;
  }

  async listPending(userId: string): Promise<TgAction[]> {
    const rows = await this.db.userAction.findMany({
      where: { userId, status: 'pending', deletedAt: null }, orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAction);
  }

  /** Approved (sending/sent) first-contact messages of the user since `since`, not counting `exceptId` (the one being sent now). */
  countFirstContact(userId: string, exceptId: string | undefined, since: Date): Promise<number> {
    return this.db.userAction.count({
      where: { userId, firstContact: true, status: { in: ['sending', 'sent'] }, updatedAt: { gte: since }, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  async claim(id: string): Promise<boolean> {
    const res = await this.db.userAction.updateMany({ where: { id, status: 'pending', deletedAt: null }, data: { status: 'sending' } });
    return res.count === 1;
  }

  async finish(id: string, status: 'sent' | 'rejected' | 'failed', reason?: string): Promise<void> {
    await this.db.userAction.update({ where: { id }, data: { status, reason: reason ?? null } });
  }
}
