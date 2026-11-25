import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User as DbUser } from '@prisma/client';
import type {
  KnowledgeAnswerDto, KnowledgeConfirmDto, KnowledgeFactPatch, KnowledgeOverview, KnowledgeTelegramDto, KnowledgeTextDto, KnowledgeUrlDto,
  SyncCatalogDto, SyncKeyResult,
} from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { assertBusinessOwner } from '../auth/ownership';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { KnowledgeFactsService } from './facts.service';
import { MetricsService } from './metrics.service';
import { QuestionsService } from './questions.service';
import { KnowledgeSourcesService } from './sources.service';
import { SyncService } from './sync.service';
import { MAX_FILE_BYTES } from './upload';

type Upload = { buffer: Buffer; mimetype: string; originalname: string };

/** Owner-only: 401 before any lookup, 403 for another business, 404 for another business's fact/question/chat id. */
@Controller('businesses/:id')
export class KnowledgeController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(KnowledgeSourcesService) private readonly sources: KnowledgeSourcesService,
    @Inject(KnowledgeFactsService) private readonly facts: KnowledgeFactsService,
    @Inject(QuestionsService) private readonly questions: QuestionsService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(SyncService) private readonly sync: SyncService,
  ) {}

  @Get('knowledge')
  @Auth()
  async overview(@Param('id') id: string, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    const [base, questions, metrics] = await Promise.all([this.facts.overview(id), this.questions.list(id), this.metrics.forBusiness(id)]);
    return ok<KnowledgeOverview>({ ...base, questions, metrics });
  }

  @Post('knowledge/sources/text')
  @Auth()
  async text(@Param('id') id: string, @Body() dto: Partial<KnowledgeTextDto>, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.sources.addText(id, dto?.text, dto?.kind));
  }

  @Post('knowledge/sources/url')
  @Auth()
  async url(@Param('id') id: string, @Body() dto: Partial<KnowledgeUrlDto>, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.sources.addUrl(id, dto?.url));
  }

  @Post('knowledge/sources/telegram')
  @Auth()
  async telegram(@Param('id') id: string, @Body() dto: Partial<KnowledgeTelegramDto>, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.sources.addTelegram(id, dto?.chatIds));
  }

  @Post('knowledge/sources/file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  @Auth()
  async file(@Param('id') id: string, @UploadedFile() file: Upload | undefined, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.sources.addFile(id, file));
  }

  @Post('knowledge/facts/confirm')
  @Auth()
  async confirm(@Param('id') id: string, @Body() dto: Partial<KnowledgeConfirmDto>, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.facts.confirm(id, dto?.ids));
  }

  @Patch('knowledge/facts/:factId')
  @Auth()
  async patchFact(@Param('id') id: string, @Param('factId') factId: string, @Body() dto: KnowledgeFactPatch, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.facts.patch(id, factId, dto));
  }

  @Post('knowledge/questions/:qid/answer')
  @Auth()
  async answer(@Param('id') id: string, @Param('qid') qid: string, @Body() dto: Partial<KnowledgeAnswerDto>, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.questions.answer(id, qid, typeof dto?.answer === 'string' ? dto.answer : ''));
  }

  @Post('knowledge/questions/:qid/dismiss')
  @Auth()
  async dismiss(@Param('id') id: string, @Param('qid') qid: string, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok(await this.questions.dismiss(id, qid));
  }

  @Post('sync-key')
  @Auth()
  async syncKey(@Param('id') id: string, @CurrentUser() user: DbUser) {
    await assertBusinessOwner(this.db, id, user);
    return ok<SyncKeyResult>({ key: await this.sync.createKey(id) });
  }
}

/** Machine endpoint (POS, script): authenticated by X-Sync-Key instead of a user token. */
@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Post('catalog')
  @HttpCode(200)
  async catalog(@Headers('x-sync-key') key: string | undefined, @Body() dto: Partial<SyncCatalogDto>) {
    return ok(await this.sync.push(await this.sync.businessByKey(key), dto?.items));
  }
}
