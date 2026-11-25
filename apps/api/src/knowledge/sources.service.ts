import {
  BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit, UnprocessableEntityException,
} from '@nestjs/common';
import type { KnowledgeSource as DbSource } from '@prisma/client';
import type { KnowledgeSource, KnowledgeSourceKind } from '@botir/shared';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { KnowledgeExtractor, MAX_SOURCE_CHARS, type ExtractInput } from './extractor';
import type { ComparableFact } from './fact-validation';
import { KeyedQueue } from './keyed-queue';
import { htmlToText, SourceError } from './text-utils';
import { MAX_FILE_BYTES, sniffFile, sttCommand, transcribe } from './upload';
import { fetchPublicHtml, parsePublicUrl } from './url-guard';

const MAX_PROCESSING = 5; // per business: every source costs one LLM call
const MAX_CHATS = 20;
const MESSAGES_PER_CHAT = 300;
const MIN_PAGE_CHARS = 80;
const GENERIC_ERROR = "Manbani o'qib bo'lmadi. Birozdan keyin qayta urinib ko'ring";
const DEFAULT_DAILY_CAP = 30;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST
const DAY_MS = 24 * 60 * 60 * 1000;
// Sources that never reach the LLM: POS sync and the owner's own answers.
const FREE_KINDS: KnowledgeSourceKind[] = ['sync', 'question'];

/** AI source reads per business per Tashkent day: KNOWLEDGE_DAILY_CAP, default 30. */
export const dailyCap = (): number => {
  const n = Number(process.env.KNOWLEDGE_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
};
const tashkentMidnight = (now: number): Date => new Date(Math.floor((now + TASHKENT_OFFSET_MS) / DAY_MS) * DAY_MS - TASHKENT_OFFSET_MS);

export const toSource = (s: DbSource, factsCount: number): KnowledgeSource => ({
  id: s.id,
  kind: s.kind as KnowledgeSourceKind,
  label: s.label,
  status: s.status as KnowledgeSource['status'],
  ...(s.error ? { error: s.error } : {}),
  factsCount,
  createdAt: s.createdAt.toISOString(),
});

/** Every add* returns a `processing` source at once; extraction runs in background → ready | failed. */
@Injectable()
export class KnowledgeSourcesService implements OnModuleInit {
  private readonly logger = new Logger('Knowledge');
  private readonly extractor: KnowledgeExtractor;
  private readonly gate = new KeyedQueue();

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AGENTS) agents: Agents,
  ) {
    this.extractor = new KnowledgeExtractor(agents.llm);
  }

  /** Background work does not survive a restart: say so instead of spinning forever. */
  async onModuleInit(): Promise<void> {
    await this.db.knowledgeSource.updateMany({
      where: { status: 'processing' }, data: { status: 'failed', error: 'Server qayta ishga tushdi. Manbani qayta yuboring' },
    });
  }

  addText(businessId: string, rawText: unknown, rawKind: unknown): Promise<KnowledgeSource> {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) throw new BadRequestException('Matn kiritilishi shart');
    if (text.length > MAX_SOURCE_CHARS) throw new BadRequestException(`Matn juda uzun (${MAX_SOURCE_CHARS} belgigacha)`);
    if (rawKind !== undefined && rawKind !== 'text' && rawKind !== 'voice') throw new BadRequestException("kind 'text' yoki 'voice' bo‘lishi kerak");
    const kind = rawKind === 'voice' ? 'voice' : 'text';
    return this.start(businessId, kind, kind === 'voice' ? 'Ovozli xabar' : 'Matn', async () => ({ text }));
  }

  addUrl(businessId: string, rawUrl: unknown): Promise<KnowledgeSource> {
    let url: URL;
    try {
      url = parsePublicUrl(rawUrl);
    } catch (e) {
      throw new BadRequestException(errMsg(e));
    }
    // No query string in the label: it may carry tokens.
    const label = `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 120);
    return this.start(businessId, 'website', label, async () => ({ text: await this.pageText(url) }));
  }

  addFile(businessId: string, file: { buffer: Buffer; mimetype: string; originalname: string } | undefined): Promise<KnowledgeSource> {
    if (!file?.buffer?.length) throw new BadRequestException('"file" yuboring (rasm, PDF yoki audio)');
    if (file.buffer.length > MAX_FILE_BYTES) throw new BadRequestException('Fayl 10 MB dan oshmasin');
    const sniffed = sniffFile(file.buffer, file.mimetype ?? '');
    if (!sniffed) throw new BadRequestException('Bu fayl turi qo‘llanmaydi. JPG, PNG, WEBP, PDF yoki audio yuboring');
    if (sniffed.kind === 'voice') {
      if (!sttCommand()) {
        // 422, not 503: the web treats 5xx as "backend is down" and switches to demo data.
        throw new UnprocessableEntityException("Serverda ovozni matnga o'girish yoqilmagan. Brauzerdagi mikrofon (diktovka) orqali gapiring yoki matn yozing");
      }
      return this.start(businessId, 'voice', 'Ovozli fayl', async () => ({ text: await transcribe(file.buffer, sniffed.ext) }));
    }
    const name = Buffer.from(file.originalname ?? '', 'latin1').toString('utf8').replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 80);
    const attachment = { mediaType: sniffed.mediaType, base64: file.buffer.toString('base64') };
    return this.start(businessId, sniffed.kind, name || (sniffed.kind === 'pdf' ? 'PDF' : 'Rasm'), async () => ({ attachment }));
  }

  /** Only chats the owner picked, only from this business's own accounts, only rows already in our DB. */
  async addTelegram(businessId: string, rawIds: unknown): Promise<KnowledgeSource> {
    if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > MAX_CHATS || !rawIds.every((x) => typeof x === 'string')) {
      throw new BadRequestException(`chatIds: 1 dan ${MAX_CHATS} tagacha chat tanlang`);
    }
    const ids = [...new Set(rawIds as string[])];
    const accounts = await this.db.tgAccount.findMany({ where: { businessId, ownerType: 'business', deletedAt: null }, select: { id: true } });
    const chats = await this.db.chat.findMany({
      where: { id: { in: ids }, accountId: { in: accounts.map((a) => a.id) }, deletedAt: null }, select: { id: true },
    });
    if (chats.length !== ids.length) throw new NotFoundException('chat not found');
    return this.start(businessId, 'telegram', `Telegram: ${ids.length} ta chat`, () => this.chatText(ids));
  }

  private async pageText(url: URL): Promise<string> {
    const instagram = /(^|\.)instagram\.com$/i.test(url.hostname);
    const blocked = new SourceError("Instagram sahifani tashqaridan o'qishga ruxsat bermadi. Profil skrinshotini yuklang yoki matnni nusxalab yuboring");
    try {
      const { html, finalUrl } = await fetchPublicHtml(url.href);
      if (/(^|\.)instagram\.com$/i.test(finalUrl.hostname) && finalUrl.pathname.startsWith('/accounts/login')) throw blocked;
      const text = htmlToText(html);
      if (text.length >= MIN_PAGE_CHARS) return text;
      throw new SourceError("Sahifada o'qiladigan matn topilmadi. Matnni nusxalab yoki skrinshot yuboring");
    } catch (e) {
      throw instagram && e instanceof SourceError ? blocked : e;
    }
  }

  private async chatText(chatIds: string[]): Promise<ExtractInput> {
    const all: string[] = [];
    const own: string[] = [];
    for (const chatId of chatIds) {
      // AI-written replies are not the owner's knowledge: never learn from ourselves.
      const rows = await this.db.inboxMessage.findMany({
        where: { chatId, deletedAt: null, author: { not: 'ai' } }, orderBy: { sentAt: 'desc' }, take: MESSAGES_PER_CHAT,
      });
      for (const m of rows.reverse()) {
        const line = m.text.replace(/\s+/g, ' ').trim(); // one line per message: a customer cannot fake a "Biz:" line
        if (!line) continue;
        const ours = m.direction === 'out';
        all.push(`${ours ? 'Biz' : 'Mijoz'}: ${line}`);
        if (ours) own.push(line);
      }
      all.push('---');
    }
    if (!own.length) throw new SourceError("Tanlangan chatlarda biznes yozgan xabar yo'q");
    return { text: all.join('\n'), telegram: { ownerText: own.join('\n') } };
  }

  private async start(businessId: string, kind: KnowledgeSourceKind, label: string, load: () => Promise<ExtractInput>): Promise<KnowledgeSource> {
    // Checks and create in one queue per business: parallel uploads cannot all pass the same count.
    const row = await this.gate.run(businessId, async () => {
      const [busy, today] = await Promise.all([
        this.db.knowledgeSource.count({ where: { businessId, status: 'processing', deletedAt: null } }),
        // Deleted and failed sources count too: each one already cost an AI read.
        this.db.knowledgeSource.count({ where: { businessId, kind: { notIn: FREE_KINDS }, createdAt: { gte: tashkentMidnight(Date.now()) } } }),
      ]);
      if (busy >= MAX_PROCESSING) throw new HttpException("Avvalgi manbalar hali o'qilmoqda. Biroz kuting", HttpStatus.TOO_MANY_REQUESTS);
      const cap = dailyCap();
      if (today >= cap) {
        throw new HttpException(`Bugungi limit tugadi: AI kuniga ${cap} ta manbani o'qiydi. Ertaga qayta urinib ko'ring`, HttpStatus.TOO_MANY_REQUESTS);
      }
      return this.db.knowledgeSource.create({ data: { businessId, kind, label } });
    });
    void this.process(row, load).catch((e: unknown) => this.logger.error(`source ${row.id}: ${errMsg(e).slice(0, 200)}`));
    return toSource(row, 0);
  }

  /**
   * What a new source must not repeat: drafts, confirmed facts, and for prices the CURRENT catalog.
   * A confirmed price the catalog no longer has (newer price, sync, deleted item) is history, so re-sending it is a change, not a duplicate.
   */
  private async known(businessId: string): Promise<ComparableFact[]> {
    const [facts, items] = await Promise.all([
      this.db.knowledgeFact.findMany({ where: { businessId, deletedAt: null, status: { in: ['draft', 'confirmed'] } } }),
      this.db.catalogItem.findMany({ where: { businessId, deletedAt: null }, select: { id: true, name: true, price: true } }),
    ]);
    const priceOf = new Map(items.map((i) => [i.id, i.price]));
    const current = facts.filter((f) => f.kind !== 'catalog' || f.status === 'draft' || (f.catalogItemId !== null && priceOf.get(f.catalogItemId) === f.price));
    return [
      ...current.map((f) => ({ ...f, kind: f.kind as ComparableFact['kind'] })),
      ...items.map((i) => ({ kind: 'catalog' as const, topic: i.name, question: null, content: i.name, price: i.price, evidence: null })),
    ];
  }

  private async process(source: DbSource, load: () => Promise<ExtractInput>): Promise<void> {
    let error: string | null = null;
    try {
      const facts = await this.extractor.extract(await load(), await this.known(source.businessId));
      await this.db.knowledgeFact.createMany({ data: facts.map((f) => ({ ...f, businessId: source.businessId, sourceId: source.id })) });
    } catch (e) {
      error = e instanceof SourceError ? e.message : GENERIC_ERROR;
      this.logger.warn(`source ${source.id} (${source.kind}) failed: ${errMsg(e).slice(0, 120)}`);
    }
    await this.db.knowledgeSource.update({ where: { id: source.id }, data: { status: error ? 'failed' : 'ready', error } });
  }
}
