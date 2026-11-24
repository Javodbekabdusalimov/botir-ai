import {
  BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import type { KnowledgeSource as DbSource } from '@prisma/client';
import type { KnowledgeFactKind, KnowledgeSource, KnowledgeSourceKind } from '@botir/shared';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { KnowledgeExtractor, MAX_SOURCE_CHARS, type ExtractInput } from './extractor';
import { htmlToText, SourceError } from './text-utils';
import { MAX_FILE_BYTES, sniffFile, sttCommand, transcribe } from './upload';
import { fetchPublicHtml, parsePublicUrl } from './url-guard';

const MAX_PROCESSING = 5; // per business: every source costs one LLM call
const MAX_CHATS = 20;
const MESSAGES_PER_CHAT = 300;
const MIN_PAGE_CHARS = 80;
const GENERIC_ERROR = "Manbani o'qib bo'lmadi. Birozdan keyin qayta urinib ko'ring";

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
        throw new ServiceUnavailableException("Serverda ovozni matnga o'girish yoqilmagan. Brauzerdagi mikrofon (diktovka) orqali gapiring yoki matn yozing");
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
    const busy = await this.db.knowledgeSource.count({ where: { businessId, status: 'processing', deletedAt: null } });
    if (busy >= MAX_PROCESSING) throw new HttpException("Avvalgi manbalar hali o'qilmoqda. Biroz kuting", HttpStatus.TOO_MANY_REQUESTS);
    const row = await this.db.knowledgeSource.create({ data: { businessId, kind, label } });
    void this.process(row, load).catch((e: unknown) => this.logger.error(`source ${row.id}: ${errMsg(e).slice(0, 200)}`));
    return toSource(row, 0);
  }

  private async process(source: DbSource, load: () => Promise<ExtractInput>): Promise<void> {
    let error: string | null = null;
    try {
      const existing = await this.db.knowledgeFact.findMany({ where: { businessId: source.businessId, deletedAt: null, status: { not: 'rejected' } } });
      const facts = await this.extractor.extract(await load(), existing.map((f) => ({ ...f, kind: f.kind as KnowledgeFactKind })));
      await this.db.knowledgeFact.createMany({ data: facts.map((f) => ({ ...f, businessId: source.businessId, sourceId: source.id })) });
    } catch (e) {
      error = e instanceof SourceError ? e.message : GENERIC_ERROR;
      this.logger.warn(`source ${source.id} (${source.kind}) failed: ${errMsg(e).slice(0, 120)}`);
    }
    await this.db.knowledgeSource.update({ where: { id: source.id }, data: { status: error ? 'failed' : 'ready', error } });
  }
}
