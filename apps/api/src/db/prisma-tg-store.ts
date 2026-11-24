import { Inject, Injectable } from '@nestjs/common';
import type { Chat as DbChat, InboxMessage as DbMsg } from '@prisma/client';
import { parseJson } from '../common/http';
import type { Chat, ChatMode, Draft, TgAccount, TgMessage, TgStore } from '../tg-connect';
import { PrismaService } from './prisma.service';

const toChat = (c: DbChat): Chat => ({
  id: c.id,
  accountId: c.accountId,
  peerId: c.peerId,
  title: c.title,
  username: c.username ?? undefined,
  mode: c.mode as ChatMode,
  needsHuman: c.needsHuman,
  draft: parseJson<Draft | undefined>(c.draft, undefined),
  lastMessageAt: c.lastMessageAt?.toISOString(),
});

const toMsg = (m: DbMsg): TgMessage => ({
  id: m.id,
  chatId: m.chatId,
  tgMsgId: m.tgMsgId,
  direction: m.direction as TgMessage['direction'],
  author: m.author as TgMessage['author'],
  text: m.text,
  sentAt: m.sentAt.toISOString(),
});

@Injectable()
export class PrismaTgStore implements TgStore {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async saveAccount(a: TgAccount): Promise<void> {
    const data = {
      kind: a.kind, tgUserId: a.tgUserId, username: a.username ?? null, sessionEnc: a.sessionEnc ?? null,
      businessConnectionId: a.businessConnectionId ?? null, connectedAt: new Date(a.connectedAt),
      deletedAt: a.deletedAt ? new Date(a.deletedAt) : null,
    };
    await this.db.tgAccount.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }

  async getAccount(accountId: string): Promise<TgAccount | undefined> {
    const a = await this.db.tgAccount.findFirst({ where: { id: accountId, deletedAt: null } });
    if (!a) return undefined;
    return {
      id: a.id, kind: a.kind as TgAccount['kind'], tgUserId: a.tgUserId, username: a.username ?? undefined,
      sessionEnc: a.sessionEnc ?? undefined, businessConnectionId: a.businessConnectionId ?? undefined,
      connectedAt: a.connectedAt.toISOString(),
    };
  }

  async upsertChat(chat: Chat): Promise<Chat> {
    const data = {
      accountId: chat.accountId, peerId: chat.peerId, title: chat.title, username: chat.username ?? null,
      needsHuman: chat.needsHuman, draft: chat.draft ? JSON.stringify(chat.draft) : null,
      lastMessageAt: chat.lastMessageAt ? new Date(chat.lastMessageAt) : null,
    };
    // Keep the user-chosen mode when re-importing an existing chat.
    const row = await this.db.chat.upsert({ where: { id: chat.id }, create: { id: chat.id, mode: chat.mode, ...data }, update: data });
    return toChat(row);
  }

  async getChat(chatId: string): Promise<Chat | undefined> {
    const c = await this.db.chat.findFirst({ where: { id: chatId, deletedAt: null } });
    return c ? toChat(c) : undefined;
  }

  async saveMessage(m: TgMessage): Promise<void> {
    const sentAt = new Date(m.sentAt);
    const data = { chatId: m.chatId, tgMsgId: m.tgMsgId, direction: m.direction, author: m.author, text: m.text, sentAt };
    await this.db.inboxMessage.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    await this.db.chat.updateMany({
      where: { id: m.chatId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: sentAt } }] },
      data: { lastMessageAt: sentAt },
    });
  }

  async listChats(accountId: string): Promise<Chat[]> {
    const rows = await this.db.chat.findMany({ where: { accountId, deletedAt: null }, orderBy: { lastMessageAt: 'desc' } });
    return rows.map(toChat);
  }

  async listMessages(chatId: string, limit?: number): Promise<TgMessage[]> {
    const rows = await this.db.inboxMessage.findMany({
      where: { chatId, deletedAt: null }, orderBy: [{ sentAt: 'desc' }, { tgMsgId: 'desc' }], ...(limit ? { take: limit } : {}),
    });
    return rows.reverse().map(toMsg);
  }

  async setChatMode(chatId: string, mode: ChatMode): Promise<Chat | undefined> {
    const res = await this.db.chat.updateMany({ where: { id: chatId, deletedAt: null }, data: { mode } });
    return res.count ? this.getChat(chatId) : undefined;
  }
}
