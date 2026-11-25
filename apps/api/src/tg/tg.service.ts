import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import type { Bot } from 'grammy';
import type { Chat as SharedChat, InboxMessage, MeTgStatus, TgConnectCodeResult } from '@botir/shared';
import type { AgentMessage } from '../agents/shared';
import { errMsg } from '../common/http';
import { toAgentBusiness, toProduct } from '../db/mappers';
import { splitSessionId } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { PrismaTgStore } from '../db/prisma-tg-store';
import { QuestionsService } from '../knowledge/questions.service';
import { TurnRecorder } from '../knowledge/turn-recorder.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { NegotiationsService } from '../negotiations/negotiations.service';
import { menuButton } from '../telegram-bot/webapp-button';
import { createBot, makeTransport, startBot } from '../telegram-bot/bot';
import {
  loadTgApiCreds, ModeHandler, Sender, TgSync, UserbotLogin,
  type Chat, type DraftReply, type OnSelf, type SendResult, type TgMessage, type Transport,
} from '../tg-connect';

/** Who owns a connected Telegram account: a business (inbox) or a site user (personal Botir). */
export type TgOwner = { type: 'business' | 'user'; id: string };

const ownerWhere = (o: TgOwner) => (o.type === 'business' ? { businessId: o.id } : { ownerType: 'user', userId: o.id });
const ownerData = (o: TgOwner) =>
  o.type === 'business' ? { ownerType: 'business', businessId: o.id, userId: null } : { ownerType: 'user', userId: o.id, businessId: null };

@Injectable()
export class TgService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TgConnect');
  private login?: UserbotLogin;
  private sync?: TgSync;
  private bot: Bot | null = null;
  private sender!: Sender;
  private modes!: ModeHandler;
  private readonly loginOwner = new Map<string, TgOwner>(); // loginId → owner
  private disabledReason = '';
  private readonly recordedTurn = new Map<string, string>(); // chatId → last customer message already counted
  private selfHandler?: OnSelf;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PrismaTgStore) private readonly store: PrismaTgStore,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(NegotiationsService) private readonly negotiations: NegotiationsService,
    @Inject(QuestionsService) private readonly questions: QuestionsService,
    @Inject(TurnRecorder) private readonly turns: TurnRecorder,
  ) {}

  async onModuleInit(): Promise<void> {
    const onIncoming = async (chat: Chat, msg: TgMessage): Promise<void> => {
      const outcome = await this.modes.handleIncoming(chat, msg);
      this.logger.log(`incoming ${chat.id}: ${outcome.action}`);
    };
    try {
      if (!process.env.TG_SESSION_KEY) throw new Error('TG_SESSION_KEY is not set');
      const creds = loadTgApiCreds();
      this.sync = new TgSync(this.store, onIncoming, creds, (accountId, text) => this.selfHandler?.(accountId, text));
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
    this.questions.setNotifier((businessId, text) => this.askOwner(businessId, text));
    await this.reconnectAccounts();
    this.startBot(onIncoming);
  }

  /** Bot DM to the business owner's linked Telegram account(s). false if the bot is off or nobody is linked. */
  async notifyBusinessOwner(businessId: string, text: string): Promise<boolean> {
    const bot = this.bot;
    if (!bot) return false;
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, deletedAt: null } });
    let sent = false;
    for (const tgUserId of new Set(accounts.map((a) => a.tgUserId))) {
      await bot.api.sendMessage(Number(tgUserId), text).then(
        () => { sent = true; },
        (e: unknown) => this.logger.warn(`notify ${businessId}: ${errMsg(e)}`),
      );
    }
    return sent;
  }

  /** Like notifyBusinessOwner, but stops at the first delivered message: a reply to it is the owner's answer. */
  private async askOwner(businessId: string, text: string): Promise<{ chatId: string; messageId: number } | null> {
    const bot = this.bot;
    if (!bot) return null;
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, deletedAt: null }, orderBy: { connectedAt: 'desc' } });
    for (const tgUserId of new Set(accounts.map((a) => a.tgUserId))) {
      try {
        const sent = await bot.api.sendMessage(Number(tgUserId), text);
        return { chatId: tgUserId, messageId: sent.message_id };
      } catch (e) {
        this.logger.warn(`ask owner ${businessId}: ${errMsg(e)}`);
      }
    }
    return null;
  }

  onModuleDestroy(): void {
    this.login?.dispose();
    void this.bot?.stop();
  }

  /** B2C: Saved Messages handler (set by TgUserService). */
  setSelfHandler(handler: OnSelf): void {
    this.selfHandler = handler;
  }

  async start(owner: TgOwner, phone: string): Promise<{ loginId: string }> {
    if (!this.login) throw new ServiceUnavailableException(this.disabledReason);
    const res = await this.login.start(phone);
    this.loginOwner.set(res.loginId, owner);
    return res;
  }

  /** Business a pending login was started for; undefined for unknown or personal (/me) logins. */
  loginBusinessId(loginId: string): string | undefined {
    const owner = this.loginOwner.get(loginId);
    return owner?.type === 'business' ? owner.id : undefined;
  }

  /** `owner` given → the login must have been started by that owner (/me endpoints). */
  async code(loginId: string, code: string, password?: string, owner?: TgOwner): Promise<TgConnectCodeResult> {
    if (!this.login) throw new ServiceUnavailableException(this.disabledReason);
    const started = this.loginOwner.get(loginId);
    if (owner && (started?.type !== owner.type || started.id !== owner.id)) throw new NotFoundException('login not found');
    const res = await this.login.submitCode(loginId, code, password);
    if (res.status === 'need_password') return { status: 'need_password' };
    if (res.status === 'error') return { status: /CODE_INVALID|CODE_EMPTY/.test(res.error) ? 'invalid_code' : 'failed' };
    this.loginOwner.delete(loginId);
    if (started) await this.db.tgAccount.update({ where: { id: res.accountId }, data: ownerData(started) });
    void this.sync?.connect(res.accountId).catch((e: unknown) => this.logger.error(`sync ${res.accountId}: ${errMsg(e)}`));
    return { status: 'connected' };
  }

  async disconnect(owner: TgOwner): Promise<{ disconnected: number }> {
    const accounts = await this.db.tgAccount.findMany({ where: { ...ownerWhere(owner), deletedAt: null } });
    for (const a of accounts) {
      if (this.sync) await this.sync.disconnect(a.id, true);
      await this.db.tgAccount.update({ where: { id: a.id }, data: { deletedAt: new Date(), sessionEnc: null } });
    }
    return { disconnected: accounts.length };
  }

  async status(owner: TgOwner): Promise<MeTgStatus> {
    const a = await this.db.tgAccount.findFirst({
      where: { ...ownerWhere(owner), kind: 'userbot', deletedAt: null, sessionEnc: { not: null } }, orderBy: { connectedAt: 'desc' },
    });
    return {
      available: Boolean(this.login),
      connected: Boolean(a),
      ...(a ? { username: a.username ?? undefined, connectedAt: a.connectedAt.toISOString() } : {}),
    };
  }

  /** Owner-approved send through PolicyGuard (Sender). */
  sendAsOwner(accountId: string, chatId: string, text: string): Promise<SendResult> {
    return this.sender.send(accountId, chatId, text, 'owner');
  }

  async sendToSelf(accountId: string, text: string): Promise<void> {
    if (!this.sync) throw new ServiceUnavailableException(this.disabledReason);
    await this.sync.sendToSelf(accountId, text);
  }

  async chats(businessId: string): Promise<SharedChat[]> {
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, deletedAt: null } });
    const out: SharedChat[] = [];
    for (const a of accounts) {
      for (const c of await this.store.listChats(a.id)) {
        const [last] = await this.store.listMessages(c.id, 1);
        out.push({
          id: c.id, tgAccountId: c.accountId, peerId: c.peerId, title: c.title, mode: c.mode,
          lastMessageAt: c.lastMessageAt ?? new Date(0).toISOString(), lastMessageText: last?.text, lastAuthor: last?.author, needsHuman: c.needsHuman,
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

  /** Business that owns the chat's Telegram account (404 if the chat or a business owner is missing). */
  async chatBusinessId(chatId: string): Promise<string> {
    const chat = await this.chat(chatId);
    const account = await this.db.tgAccount.findFirst({ where: { id: chat.accountId, deletedAt: null } });
    if (!account?.businessId) throw new NotFoundException('chat not found');
    return account.businessId;
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
    const products = (await this.db.catalogItem.findMany({ where: { businessId: biz.id, deletedAt: null, inStock: true } })).map(toProduct);
    const agentHistory: AgentMessage[] = history.map((m) => ({
      id: m.id, role: m.direction === 'in' ? 'user' : 'biz_agent', text: m.text, at: m.sentAt,
    }));
    const turn = await this.agents.businessAgent.respond({
      sessionId: `tg:${chat.id}`, business: toAgentBusiness(biz), products, history: agentHistory, round: 1,
      lang: biz.lang === 'ru' ? 'ru' : 'uz',
    });
    const needsHuman = turn.confidence < 0.5 || turn.violations.length > 0 || Boolean(turn.unknownQuestion);
    const lastIn = [...history].reverse().find((m) => m.direction === 'in');
    if (lastIn && this.recordedTurn.get(chat.id) !== lastIn.id) { // re-drafting the same message is not a new turn
      this.recordedTurn.set(chat.id, lastIn.id);
      void this.turns.record(biz.id, 'inbox', { confidence: turn.confidence, unknownQuestion: turn.unknownQuestion, needsHuman });
    }
    return { text: turn.reply, confidence: turn.confidence, needsHuman };
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
      answerQuestion: (chatId, messageId, text) => this.questions.answerByReply(String(chatId), messageId, text),
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
    // Chat pastidagi menyu tugmasi → Mini App (BotFather'da qo'lda sozlanmasa ham)
    const menu = menuButton();
    if (menu) void res.bot.api.setChatMenuButton({ menu_button: menu }).catch((e: unknown) => this.logger.warn(`menu button: ${e instanceof Error ? e.message : String(e)}`));
  }
}
