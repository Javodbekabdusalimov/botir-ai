import { BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type PendingQuestion as DbQuestion } from '@prisma/client';
import type { PendingQuestion } from '@botir/shared';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { MetricsService } from './metrics.service';
import { normalizeName, redactPii } from './text-utils';
import { topicOf } from './topics';

const HOUR = 60 * 60 * 1000;
const MAX_NOTIFY_PER_HOUR = 10;
const MAX_OPEN = 200; // /agent/request is open to guests: the list must not grow without bound
const MAX_QUESTION = 300;
const MAX_ANSWER = 1000;

/** Sends text to the business owner; null if there is no bot or nobody is linked. */
export type OwnerNotifier = (businessId: string, text: string) => Promise<{ chatId: string; messageId: number } | null>;

/** One line, capped, no PII (the question becomes an FAQ later). */
export const cleanQuestion = (s: string): string =>
  redactPii(s).replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);

const FILLERS = new Set(['salom', 'assalomu', 'alaykum', 'sizda', 'sizlarda', 'iltimos', 'ayting', 'aytingchi', 'здравствуйте', 'у', 'вас']);

/** Dedupe key: lower case, no apostrophes/punctuation, no greetings. */
export function normalizeQuestion(s: string): string {
  const words = normalizeName(s).split(' ').filter(Boolean);
  const kept = words.filter((w) => !FILLERS.has(w));
  return (kept.length ? kept : words).join(' ');
}

const toShared = (q: DbQuestion): PendingQuestion => ({
  id: q.id, question: q.question, timesAsked: q.timesAsked, status: q.status as PendingQuestion['status'],
  ...(q.answer ? { answer: q.answer } : {}), createdAt: q.createdAt.toISOString(),
});

/** Questions the agent could not answer. The owner answers once → confirmed FAQ. */
@Injectable()
export class QuestionsService {
  private readonly logger = new Logger('Questions');
  private notifier?: OwnerNotifier;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  /** Set by TgService (a setter, not DI: TgService already depends on this service). */
  setNotifier(notifier: OwnerNotifier): void {
    this.notifier = notifier;
  }

  async record(businessId: string, rawQuestion: string): Promise<void> {
    const question = cleanQuestion(rawQuestion);
    const normalized = normalizeQuestion(question);
    if (!normalized) return;
    const key = { businessId_normalized: { businessId, normalized } };
    const existing = await this.db.pendingQuestion.findUnique({ where: key });
    if (existing) return this.askedAgain(existing);
    if ((await this.db.pendingQuestion.count({ where: { businessId, status: 'open', deletedAt: null } })) >= MAX_OPEN) return;
    let created: DbQuestion;
    try {
      created = await this.db.pendingQuestion.create({ data: { businessId, question, normalized } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      return this.askedAgain(await this.db.pendingQuestion.findUniqueOrThrow({ where: key })); // parallel lane won the race
    }
    await this.notify(created);
  }

  async list(businessId: string): Promise<PendingQuestion[]> {
    const rows = await this.db.pendingQuestion.findMany({
      where: { businessId, deletedAt: null }, orderBy: [{ timesAsked: 'desc' }, { createdAt: 'desc' }],
    });
    const open = rows.filter((q) => q.status === 'open');
    return [...open, ...rows.filter((q) => q.status !== 'open')].map(toShared);
  }

  /** The owner typed this text → a `question` source + a CONFIRMED faq fact. */
  async answer(businessId: string, qid: string, rawAnswer: string): Promise<PendingQuestion> {
    const answer = String(rawAnswer ?? '').trim();
    if (!answer) throw new BadRequestException('answer is required');
    if (answer.length > MAX_ANSWER) throw new BadRequestException(`answer must be at most ${MAX_ANSWER} characters`);
    const q = await this.find(businessId, qid);
    const row = await this.db.$transaction(async (tx) => {
      // Claim first: a double submit (panel + Telegram reply) must not create two facts.
      const claimed = await tx.pendingQuestion.updateMany({
        where: { id: q.id, status: { not: 'answered' }, deletedAt: null }, data: { status: 'answered', answer },
      });
      if (claimed.count === 0) throw new ConflictException('question is already answered');
      const source = await tx.knowledgeSource.create({ data: { businessId, kind: 'question', label: q.question, status: 'ready' } });
      const fact = await tx.knowledgeFact.create({
        data: {
          businessId, sourceId: source.id, kind: 'faq', topic: topicOf(q.question), question: q.question, content: answer,
          confidence: 1, status: 'confirmed', confirmedAt: new Date(),
        },
      });
      return tx.pendingQuestion.update({ where: { id: q.id }, data: { factId: fact.id } });
    });
    await this.metrics.touchReady(businessId).catch((e: unknown) => this.logger.warn(`touchReady ${businessId}: ${errMsg(e)}`));
    return toShared(row);
  }

  async dismiss(businessId: string, qid: string): Promise<PendingQuestion> {
    const q = await this.find(businessId, qid);
    const res = await this.db.pendingQuestion.updateMany({ where: { id: q.id, status: { not: 'answered' } }, data: { status: 'dismissed' } });
    if (res.count === 0) throw new ConflictException('question is already answered');
    return toShared({ ...q, status: 'dismissed' });
  }

  /**
   * Telegram reply to the bot's question message. null = this is not a reply to a question (normal bot flow continues).
   * The chat must match the one the question was sent to and must still be linked to the business.
   */
  async answerByReply(chatId: string, messageId: number, text: string): Promise<string | null> {
    const q = await this.db.pendingQuestion.findFirst({ where: { tgChatId: chatId, tgMessageId: messageId, deletedAt: null } });
    if (!q) return null;
    const linked = await this.db.tgAccount.findFirst({ where: { businessId: q.businessId, tgUserId: chatId, deletedAt: null } });
    if (!linked) return 'Bu biznesga ulanmagansiz, javob saqlanmadi.';
    try {
      await this.answer(q.businessId, q.id, text);
      return `✅ Saqlandi. Agent endi shu javobni ishlatadi: «${q.question}»`;
    } catch (e) {
      if (e instanceof ConflictException) return 'Bu savolga allaqachon javob berilgan. Javobni saytdagi bilimlar bo‘limida o‘zgartiring.';
      if (e instanceof HttpException) return `Javob saqlanmadi: matn 1–${MAX_ANSWER} belgi bo‘lishi kerak.`;
      throw e;
    }
  }

  private async find(businessId: string, qid: string): Promise<DbQuestion> {
    const q = await this.db.pendingQuestion.findFirst({ where: { id: qid, businessId, deletedAt: null } });
    if (!q) throw new NotFoundException('question not found');
    return q;
  }

  /** Dismissed stays dismissed. Answered reopens only if its fact is gone (rejected/deleted by the owner). */
  private async askedAgain(q: DbQuestion): Promise<void> {
    const factLost =
      q.status === 'answered' && q.factId !== null &&
      (await this.db.knowledgeFact.count({ where: { id: q.factId, status: 'confirmed', deletedAt: null } })) === 0;
    await this.db.pendingQuestion.update({
      where: { id: q.id },
      data: { timesAsked: { increment: 1 }, ...(factLost ? { status: 'open', answer: null, factId: null } : {}) },
    });
  }

  /** Once per question (only on creation); at most 10 questions per business per rolling hour. Never throws. */
  private async notify(q: DbQuestion): Promise<void> {
    if (!this.notifier) return;
    try {
      const recent = await this.db.pendingQuestion.count({
        where: { businessId: q.businessId, createdAt: { gte: new Date(Date.now() - HOUR) } },
      });
      if (recent > MAX_NOTIFY_PER_HOUR) return;
      const sent = await this.notifier(
        q.businessId,
        `❓ Mijoz so'radi, agent javobini bilmaydi:\n\n«${q.question}»\n\nShu xabarga javob (reply) yozing — agent keyingi safar o'zi javob beradi.`,
      );
      if (sent) await this.db.pendingQuestion.update({ where: { id: q.id }, data: { tgChatId: sent.chatId, tgMessageId: sent.messageId } });
    } catch (e) {
      this.logger.warn(`notify ${q.id}: ${errMsg(e)}`);
    }
  }
}
