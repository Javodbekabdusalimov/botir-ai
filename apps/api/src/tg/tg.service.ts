import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import type { Bot } from 'grammy';
import type { Chat as SharedChat, InboxMessage, TgConnectCodeResult } from '@botir/shared';
import type { AgentMessage } from '../agents/shared';
import { errMsg } from '../common/http';
import { toAgentBusiness, toProduct } from '../db/mappers';
import { splitSessionId } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { PrismaTgStore } from '../db/prisma-tg-store';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { NegotiationsService } from '../negotiations/negotiations.service';
import { createBot, makeTransport, startBot } from '../telegram-bot/bot';
import {
  loadTgApiCreds, ModeHandler, Sender, TgSync, UserbotLogin,
  type Chat, type DraftReply, type TgMessage, type Transport,
} from '../tg-connect';

@Injectable()
export class TgService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TgConnect');
  private login?: UserbotLogin;
  private sync?: TgSync;
  private bot: Bot | null = null;
  private sender!: Sender;
  private modes!: ModeHandler;
  private readonly loginBusiness = new Map<string, string>(); // loginId → businessId
  private disabledReason = '';

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PrismaTgStore) private readonly store: PrismaTgStore,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(NegotiationsService) private readonly negotiations: NegotiationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const onIncoming = async (chat: Chat, msg: TgMessage): Promise<void> => {
      const outcome = await this.modes.handleIncoming(chat, msg);
      this.logger.log(`incoming ${chat.id}: ${outcome.action}`);
    };
    try {
      if (!process.env.TG_SESSION_KEY) throw new Error('TG_SESSION_KEY is not set');
      const creds = loadTgApiCreds();
      this.sync = new TgSync(this.store, onIncoming, creds);
      this.login = new UserbotLogin(this.store, creds);
    } catch (e) {
      this.disabledReason = `Telegram userbot disabled: ${errMsg(e)}`;
      this.logger.warn(this.disabledReason);
    }
    const noUserbot: Transport = async () => {
      throw new Error(this.disabledReason || 'userbot not connected');
    };
    const transport: Transport = this.sync ? makeTransport(this.store, () => this.bot, this.sync) : noUserbot;
    this.sender = new Sender(this.store, transport);
    this.modes = new ModeHandler(this.store, this.sender, (chat, history) => this.draftReply(chat, history), () => undefined);
    await this.reconnectAccounts();
    this.startBot(onIncoming);
  }

  onModuleDestroy(): void {
    this.login?.dispose();
    void this.bot?.stop();
  }

  async start(businessId: string, phone: string): Promise<{ loginId: string }> {
    if (!this.login) throw new ServiceUnavailableException(this.disabledReason);
    const res = await this.login.start(phone);
    this.loginBusiness.set(res.loginId, businessId);
    return res;
  }

  async code(loginId: string, code: string, password?: string): Promise<TgConnectCodeResult> {
    if (!this.login) throw new ServiceUnavailableException(this.disabledReason);
    const res = await this.login.submitCode(loginId, code, password);
    if (res.status === 'need_password') return { status: 'need_password' };
    if (res.status === 'error') return { status: /CODE_INVALID|CODE_EMPTY/.test(res.error) ? 'invalid_code' : 'failed' };
    const businessId = this.loginBusiness.get(loginId);
    this.loginBusiness.delete(loginId);
    if (businessId) await this.db.tgAccount.update({ where: { id: res.accountId }, data: { businessId } });
    void this.sync?.connect(res.accountId).catch((e: unknown) => this.logger.error(`sync ${res.accountId}: ${errMsg(e)}`));
    return { status: 'connected' };
  }

  async disconnect(businessId: string): Promise<{ disconnected: number }> {
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, deletedAt: null } });
    for (const a of accounts) {
      if (this.sync) await this.sync.disconnect(a.id, true);
      await this.db.tgAccount.update({ where: { id: a.id }, data: { deletedAt: new Date(), sessionEnc: null } });
    }
    return { disconnected: accounts.length };
  }

  async chats(businessId: string): Promise<SharedChat[]> {
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, deletedAt: null } });
    const out: SharedChat[] = [];
    for (const a of accounts) {
      for (const c of await this.store.listChats(a.id)) {
        const [last] = await this.store.listMessages(c.id, 1);
        out.push({
          id: c.id, tgAccountId: c.accountId, peerId: c.peerId, title: c.title, mode: c.mode,
          lastMessageAt: c.lastMessageAt ?? new Date(0).toISOString(), lastMessageText: last?.text, needsHuman: c.needsHuman,
        });
      }
    }
    return out.sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt));
  }

  async messages(chatId: string): Promise<InboxMessage[]> {
    const chat = await this.chat(chatId);
    const list: InboxMessage[] = (await this.store.listMessages(chatId, 200)).map((m) => ({
      id: m.id, chatId, direction: m.direction, author: m.author, text: m.text, sentAt: m.sentAt,
    }));
    if (chat.draft) {
      list.push({ id: `${chatId}:draft`, chatId, direction: 'out', author: 'ai', text: chat.draft.text, sentAt: chat.draft.createdAt, isDraft: true });
    }
    return list;
  }

  async send(chatId: string, text: string): Promise<InboxMessage> {
    const chat = await this.chat(chatId);
    const res = await this.sender.send(chat.accountId, chatId, text ?? '', 'owner');
    if (!res.ok) throw new ServiceUnavailableException(res.reason);
    const m = res.message;
    return { id: m.id, chatId, direction: m.direction, author: m.author, text: m.text, sentAt: m.sentAt };
  }

  async setMode(chatId: string, mode: Chat['mode']): Promise<{ mode: Chat['mode'] }> {
    const chat = await this.modes.setMode(chatId, mode);
    if (!chat) throw new NotFoundException('chat not found');
    return { mode: chat.mode };
  }

  /** Copilot: draft a reply with the business agent and store it on the chat (not sent). */
  async draft(chatId: string): Promise<DraftReply> {
    const chat = await this.chat(chatId);
    const draft = await this.draftReply(chat, await this.store.listMessages(chatId, 20));
    await this.store.upsertChat({ ...chat, needsHuman: draft.needsHuman, draft: { ...draft, createdAt: new Date().toISOString() } });
    return draft;
  }

  private async chat(chatId: string): Promise<Chat> {
    const chat = await this.store.getChat(chatId);
    if (!chat) throw new NotFoundException('chat not found');
    return chat;
  }

  private async draftReply(chat: Chat, history: TgMessage[]): Promise<DraftReply> {
    const account = await this.db.tgAccount.findUnique({ where: { id: chat.accountId } });
    const biz = account?.businessId ? await this.db.business.findFirst({ where: { id: account.businessId, deletedAt: null } }) : null;
    if (!biz) return { text: '', confidence: 0, needsHuman: true };
    const products = (await this.db.catalogItem.findMany({ where: { businessId: biz.id, deletedAt: null } })).map(toProduct);
    const agentHistory: AgentMessage[] = history.map((m) => ({
      id: m.id, role: m.direction === 'in' ? 'user' : 'biz_agent', text: m.text, at: m.sentAt,
    }));
    const turn = await this.agents.businessAgent.respond({
      sessionId: `tg:${chat.id}`, business: toAgentBusiness(biz), products, history: agentHistory, round: 1,
      lang: biz.lang === 'ru' ? 'ru' : 'uz',
    });
    return { text: turn.reply, confidence: turn.confidence, needsHuman: turn.confidence < 0.5 || turn.violations.length > 0 };
  }

  private async reconnectAccounts(): Promise<void> {
    if (!this.sync) return;
    const accounts = await this.db.tgAccount.findMany({ where: { kind: 'userbot', deletedAt: null, sessionEnc: { not: null } } });
    for (const a of accounts) {
      void this.sync.connect(a.id).catch((e: unknown) => this.logger.warn(`reconnect ${a.id}: ${errMsg(e)}`));
    }
  }

  private startBot(onIncoming: (chat: Chat, msg: TgMessage) => Promise<void>): void {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set — Telegram bot disabled');
      return;
    }
    const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const res = createBot({
      store: this.store,
      sender: this.sender,
      onIncoming,
      personalAgent: async (userId, text) => {
        const r = await this.negotiations.request(`tg:${userId}`, text);
        return `Qabul qildim! Agentlarim bizneslar bilan gaplashmoqda. Jonli kuzating: ${webUrl}/live/${r.negotiationId}`;
      },
      resolveContact: async (ownerTgId, name) => {
        const accounts = await this.db.tgAccount.findMany({ where: { tgUserId: String(ownerTgId), deletedAt: null } });
        const chat = await this.db.chat.findFirst({
          where: { accountId: { in: accounts.map((a) => a.id) }, title: { contains: name }, deletedAt: null },
        });
        return chat ? { accountId: chat.accountId, chatId: chat.id } : null;
      },
      confirmOffer: async (offerId) => {
        const offer = await this.db.agentOffer.findUnique({ where: { id: offerId } });
        if (!offer) return 'Taklif topilmadi';
        const { negotiationId, businessId } = splitSessionId(offer.sessionId);
        const r = await this.negotiations.confirm(negotiationId, businessId);
        return `✅ Buyurtma tasdiqlandi. To'lov havolasi: ${r.paymentLink}`;
      },
    });
    if (!res.bot) return;
    this.bot = res.bot;
    startBot(res.bot);
  }
}
