import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExternalBusiness as DbExternal, User as DbUser } from '@prisma/client';
import type {
  BusinessCategory, NegotiationTask, OutreachDraft, OutreachOption, OutreachPartnerAlternative, OutreachPlan, OutreachSendResult,
  OutreachTaskPlan, OutreachThread,
} from '@botir/shared';
import type { UserTask } from '../agents';
import { errMsg, parseJson } from '../common/http';
import { PrismaActionStore } from '../db/prisma-action-store';
import { PrismaService } from '../db/prisma.service';
import { PrismaTgStore } from '../db/prisma-tg-store';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { TgService } from '../tg/tg.service';
import { chatKey, FIRST_CONTACT_PER_DAY } from '../tg-connect';
import { pickChannel, telegramTarget, templateMessage, withDisclosure, type ExternalContacts } from './contacts';
import { canonicalDistrict } from './districts';

const MAX_OPTIONS = 5;
const MAX_ALTERNATIVES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PAYMENT_NOTE = "To'lov biznesga to'g'ridan-to'g'ri amalga oshiriladi. Life Assistant to'lov havolasi yaratmaydi.";
const NOT_FOUND_TEXT = "Kontakt topilmadi: bu turdagi bizneslar uchun aloqa ma'lumoti yo'q. Eng yaqin hamkorlarimizni ko'rsatamiz, so'rovingizni esa taklif ro'yxatiga yozib qo'ydik.";

const sameDistrict = (a?: string | null, b?: string): boolean => {
  const x = (canonicalDistrict(a ?? undefined) ?? a ?? '').trim().toLowerCase();
  const y = (canonicalDistrict(b) ?? b ?? '').trim().toLowerCase();
  return Boolean(x && x === y);
};

interface PlanTask {
  category: BusinessCategory;
  need: string;
  district?: string;
  people?: number;
}

@Injectable()
export class OutreachService {
  private readonly logger = new Logger('Outreach');
  private readonly summaries = new Map<string, string | null>(); // `${chatId}:${lastInboundId}` → summary

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PrismaTgStore) private readonly store: PrismaTgStore,
    @Inject(PrismaActionStore) private readonly actions: PrismaActionStore,
    @Inject(TgService) private readonly tg: TgService,
  ) {}

  async plan(user: DbUser, dto: { text?: string; negotiationId?: string; district?: string }): Promise<OutreachPlan> {
    const tasks = await this.tasksOf(user.id, dto);
    const telegramConnected = (await this.tg.status({ type: 'user', id: user.id })).connected;
    const plans: OutreachTaskPlan[] = [];
    for (const task of tasks) plans.push(await this.planTask(user.id, task));
    return { telegramConnected, paymentNote: PAYMENT_NOTE, tasks: plans };
  }

  async draft(optionId: string, input: { text: string; district?: string }): Promise<OutreachDraft> {
    const ext = await this.external(optionId);
    const choice = pickChannel(contactsOf(ext));
    const request = cleanText(input.text, 500);
    if (!request) throw new BadRequestException('text is required');
    const fallback = templateMessage(request, ext.name);
    let text = fallback;
    try {
      const { data } = await this.agents.llm.completeJson<{ text?: string }>({
        model: 'haiku',
        purpose: 'outreach_draft',
        system: [
          "Sen foydalanuvchi nomidan biznesga birinchi xabar yozuvchi yordamchisan. O'zbek (lotin), muloyim, 2–3 gap, 400 belgidan oshmasin.",
          "Xabarda: salom, aniq so'rov (faqat foydalanuvchi aytgan narsa), narx va bo'sh vaqtni so'rash.",
          "Xabarda aynan shu ibora bo'lsin: \"Life Assistant yordamchisi orqali yozilmoqda\".",
          "Foydalanuvchining byudjetini, to'lov yoki oldindan to'lov haqida va'da yozma. Taxmin qo'shma.",
          'JSON: {"text":string}',
        ].join('\n'),
        prompt: `Biznes: ${ext.name}${ext.district ? `, ${ext.district}` : ''}\nFoydalanuvchi so'rovi: ${request}`,
      });
      const t = cleanText(data.text, 600);
      if (t) text = t;
    } catch (e) {
      this.logger.warn(`draft fallback (${errMsg(e)})`);
    }
    return {
      optionId, channel: choice.channel, text: withDisclosure(text), ...(choice.link ? { link: choice.link } : {}),
      ...(choice.channel === 'telegram_bot' ? { startFirst: true } : {}),
    };
  }

  /** Creates a pending UserAction (the user approves it on /me/actions). Nothing is sent here. */
  async send(user: DbUser, optionId: string, rawText: string): Promise<OutreachSendResult> {
    const ext = await this.external(optionId);
    const contacts = contactsOf(ext);
    const { channel } = pickChannel(contacts);
    const target = telegramTarget(contacts, channel);
    const text = cleanText(rawText, 1000);
    if (!target) throw new BadRequestException("Bu kontakt Telegram orqali yozilmaydi: taklif havolasidan foydalaning");
    if (!text) throw new BadRequestException('text is required');
    const account = await this.db.tgAccount.findFirst({
      where: { ownerType: 'user', userId: user.id, kind: 'userbot', deletedAt: null, sessionEnc: { not: null } }, orderBy: { connectedAt: 'desc' },
    });
    if (!account) throw new ConflictException('Telegram ulanmagan: avval /me/tg-connect orqali ulang yoki havoladan foydalaning');

    const peer = await this.tg.resolvePeer(account.id, target);
    const chatId = chatKey(account.id, peer.peerId);
    const chat = (await this.store.getChat(chatId))
      ?? (await this.store.upsertChat({ id: chatId, accountId: account.id, peerId: peer.peerId, title: ext.name, username: target, mode: 'copilot', needsHuman: false }));
    const history = await this.store.listMessages(chat.id);
    const wrote = history.some((m) => m.direction === 'out');
    const heard = history.some((m) => m.direction === 'in');
    if (wrote && !heard) throw new ConflictException('Javob kutilmoqda: biznes yozmaguncha yangi xabar yuborib bo\'lmaydi');
    const firstContact = !wrote && !heard;
    if (firstContact && (await this.actions.countFirstContact(user.id, undefined, new Date(Date.now() - DAY_MS))) >= FIRST_CONTACT_PER_DAY) {
      throw new HttpException(`Kuniga ${FIRST_CONTACT_PER_DAY} tadan ortiq yangi kontaktga yozib bo'lmaydi`, HttpStatus.TOO_MANY_REQUESTS);
    }
    // A bot answers /start first; the request text goes out after its reply.
    const startOnly = channel === 'telegram_bot' && firstContact;
    const action = await this.actions.create({
      userId: user.id, accountId: account.id, chatId: chat.id, peerTitle: ext.name, text: startOnly ? '/start' : text,
      firstContact, externalBusinessId: ext.id,
    });
    return {
      action: { id: action.id, chatId: action.chatId, peerTitle: action.peerTitle, text: action.text, status: action.status, createdAt: action.createdAt },
      ...(startOnly ? { sendTextAfterReply: text } : {}),
    };
  }

  async threads(user: DbUser): Promise<OutreachThread[]> {
    const rows = await this.db.userAction.findMany({
      where: { userId: user.id, externalBusinessId: { not: null }, status: 'sent', deletedAt: null }, orderBy: { createdAt: 'desc' },
    });
    const byChat = new Map<string, string>(); // chatId → externalBusinessId (newest action wins)
    for (const r of rows) if (r.externalBusinessId && !byChat.has(r.chatId)) byChat.set(r.chatId, r.externalBusinessId);
    const exts = await this.db.externalBusiness.findMany({ where: { id: { in: [...byChat.values()] } } });
    const out: OutreachThread[] = [];
    for (const [chatId, optionId] of byChat) {
      const messages = await this.store.listMessages(chatId, 10);
      const incoming = messages.filter((m) => m.direction === 'in');
      const last = incoming[incoming.length - 1];
      out.push({
        optionId, name: exts.find((e) => e.id === optionId)?.name ?? '', chatId,
        replies: messages.map((m) => ({ id: m.id, direction: m.direction, text: m.text, sentAt: m.sentAt })),
        summary: last ? await this.summarize(chatId, last.id, incoming.slice(-5).map((m) => m.text)) : null,
        ...(last ? { lastReplyAt: last.sentAt } : {}),
      });
    }
    return out.sort((a, b) => (b.lastReplyAt ?? '').localeCompare(a.lastReplyAt ?? ''));
  }

  private async summarize(chatId: string, lastId: string, replies: string[]): Promise<string | null> {
    const key = `${chatId}:${lastId}`;
    if (this.summaries.has(key)) return this.summaries.get(key) ?? null;
    let summary: string | null = null;
    try {
      const { data } = await this.agents.llm.completeJson<{ summary?: string | null }>({
        model: 'haiku',
        purpose: 'outreach_summary',
        system: [
          "Biznes javoblaridan FAQAT narx va band/bo'sh vaqt haqidagi aniq ma'lumotni o'zbek (lotin) tilida 1–2 gapda yig'ib ber.",
          "Matnda bunday ma'lumot yo'q bo'lsa summary = null. Taxmin qilma, raqamni o'zgartirma.",
          'JSON: {"summary":string|null}',
        ].join('\n'),
        prompt: replies.map((t, i) => `${i + 1}. ${t.slice(0, 600)}`).join('\n'),
      });
      summary = cleanText(data.summary, 300) ?? null;
    } catch (e) {
      this.logger.warn(`summary ${chatId}: ${errMsg(e)}`);
      return null; // not cached: try again next time
    }
    this.summaries.set(key, summary);
    return summary;
  }

  private async tasksOf(userId: string, dto: { text?: string; negotiationId?: string; district?: string }): Promise<PlanTask[]> {
    if (dto.negotiationId) {
      const neg = await this.db.negotiation.findFirst({ where: { id: dto.negotiationId, userId, deletedAt: null } });
      if (!neg) throw new NotFoundException('negotiation not found');
      return parseJson<NegotiationTask[]>(neg.tasks, []).map((t) => ({
        category: t.category, need: t.need, people: t.people, district: canonicalDistrict(t.where) ?? t.where ?? dto.district,
      }));
    }
    const text = cleanText(dto.text, 1000);
    if (!text) throw new BadRequestException('text or negotiationId is required');
    const parsed = await this.agents.personalAgent.parse(text, '', dto.district);
    return parsed.map((t) => ({ category: t.category, need: t.need, people: t.people, district: t.area }));
  }

  private async planTask(userId: string, task: PlanTask): Promise<OutreachTaskPlan> {
    const rows = await this.db.externalBusiness.findMany({ where: { category: task.category, deletedAt: null } });
    const options = rows
      .map((e) => toOption(e, task))
      .sort((a, b) => Number(b.sameDistrict) - Number(a.sameDistrict) || channelRank(a) - channelRank(b) || a.name.localeCompare(b.name))
      .slice(0, MAX_OPTIONS);
    const base = { category: task.category, need: task.need, ...(task.district ? { district: task.district } : {}), options };
    if (options.some((o) => o.channel !== 'none')) return base;
    return { ...base, notFound: { message: NOT_FOUND_TEXT, alternatives: await this.alternatives(task), wantedId: await this.wanted(userId, task) } };
  }

  private async alternatives(task: PlanTask): Promise<OutreachPartnerAlternative[]> {
    const userTask: UserTask = { category: task.category, need: task.need, ...(task.district ? { area: task.district } : {}) };
    const top = (await this.agents.personalAgent.findBusinesses(userTask)).slice(0, MAX_ALTERNATIVES);
    const rows = await this.db.business.findMany({ where: { id: { in: top.map((b) => b.id) }, deletedAt: null } });
    return top.flatMap((b) => {
      const r = rows.find((x) => x.id === b.id);
      return r ? [{ businessId: r.id, name: r.name, district: r.district, address: r.address, ...(r.landmark ? { landmark: r.landmark } : {}) }] : [];
    });
  }

  private async wanted(userId: string, task: PlanTask): Promise<string> {
    const where = { userId, category: task.category, district: task.district ?? null, need: task.need, deletedAt: null };
    const existing = await this.db.wantedBusiness.findFirst({ where });
    return (existing ?? (await this.db.wantedBusiness.create({ data: where }))).id;
  }

  private async external(id: string): Promise<DbExternal> {
    const ext = await this.db.externalBusiness.findFirst({ where: { id, deletedAt: null } });
    if (!ext) throw new NotFoundException('option not found');
    return ext;
  }
}

/** Best way in first: Telegram user, bot, then handoff in chain order, 'none' last. */
const HANDOFF_ORDER = ['telegram_channel', 'instagram', 'phone', 'website'];
const channelRank = (o: OutreachOption): number =>
  o.channel === 'telegram_user' ? 0 : o.channel === 'telegram_bot' ? 1 : o.channel === 'handoff' ? 2 + HANDOFF_ORDER.indexOf(o.handoffKind ?? '') : 9;

const contactsOf = (e: DbExternal): ExternalContacts => parseJson<ExternalContacts>(e.contacts, {});

function cleanText(v: unknown, max: number): string | undefined {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return s || undefined;
}

function toOption(e: DbExternal, task: PlanTask): OutreachOption {
  const choice = pickChannel(contactsOf(e));
  return {
    optionId: e.id, name: e.name, category: e.category as BusinessCategory,
    ...(e.district ? { district: e.district } : {}), ...(e.address ? { address: e.address } : {}),
    ...(e.landmark ? { landmark: e.landmark } : {}),
    ...(e.lat !== null && e.lng !== null ? { geo: { lat: e.lat, lng: e.lng } } : {}),
    ...(e.workHours ? { workHours: e.workHours } : {}),
    sameDistrict: sameDistrict(e.district, task.district),
    channel: choice.channel,
    ...(choice.handoffKind ? { handoffKind: choice.handoffKind } : {}), ...(choice.link ? { link: choice.link } : {}),
    message: templateMessage(task.need, e.name, { people: task.people }),
    sources: parseJson<string[]>(e.sources, []), retrievedAt: e.retrievedAt,
  };
}
