import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { ChatMode, SendMessageDto, SetModeDto, TgConnectCodeDto, TgConnectStartDto } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { assertBusinessOwner, ownsBusiness } from '../auth/ownership';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { TgService } from './tg.service';

const MODES: ChatMode[] = ['copilot', 'command', 'autopilot', 'off'];

@Controller()
export class TgController {
  constructor(
    @Inject(TgService) private readonly tg: TgService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  @Post('tg-connect/start')
  @Auth()
  async start(@Body() dto: TgConnectStartDto, @CurrentUser() user: DbUser) {
    if (!dto?.businessId || !dto.phone) throw new BadRequestException('businessId and phone are required');
    await assertBusinessOwner(this.db, dto.businessId, user);
    return ok(await this.tg.start({ type: 'business', id: dto.businessId }, dto.phone));
  }

  /** Only the owner of the business the login was started for; anyone else sees 404 (no loginId probing). */
  @Post('tg-connect/code')
  @Auth()
  async code(@Body() dto: TgConnectCodeDto, @CurrentUser() user: DbUser) {
    if (!dto?.loginId || !dto.code) throw new BadRequestException('loginId and code are required');
    const businessId = this.tg.loginBusinessId(dto.loginId);
    const b = businessId ? await this.db.business.findFirst({ where: { id: businessId, deletedAt: null } }) : null;
    if (!b || !ownsBusiness(b, user)) throw new NotFoundException('login not found');
    return ok(await this.tg.code(dto.loginId, dto.code, dto.password, { type: 'business', id: b.id }));
  }

  @Delete('tg-connect')
  @Auth()
  async disconnect(@Query('businessId') businessId: string, @CurrentUser() user: DbUser) {
    if (!businessId) throw new BadRequestException('businessId is required');
    await assertBusinessOwner(this.db, businessId, user);
    return ok(await this.tg.disconnect({ type: 'business', id: businessId }));
  }

  @Get('inbox')
  @Auth()
  async inbox(@Query('businessId') businessId: string, @CurrentUser() user: DbUser) {
    if (!businessId) throw new BadRequestException('businessId is required');
    await assertBusinessOwner(this.db, businessId, user);
    return ok(await this.tg.chats(businessId));
  }

  @Get('inbox/:chatId/messages')
  @Auth()
  async messages(@Param('chatId') chatId: string, @CurrentUser() user: DbUser) {
    await this.assertChatOwner(chatId, user);
    return ok(await this.tg.messages(chatId));
  }

  @Post('inbox/:chatId/send')
  @Auth()
  async send(@Param('chatId') chatId: string, @Body() dto: SendMessageDto, @CurrentUser() user: DbUser) {
    await this.assertChatOwner(chatId, user);
    return ok(await this.tg.send(chatId, dto?.text));
  }

  @Patch('inbox/:chatId/mode')
  @Auth()
  async mode(@Param('chatId') chatId: string, @Body() dto: SetModeDto, @CurrentUser() user: DbUser) {
    await this.assertChatOwner(chatId, user);
    if (!MODES.includes(dto?.mode)) throw new BadRequestException(`mode must be one of ${MODES.join('|')}`);
    return ok(await this.tg.setMode(chatId, dto.mode));
  }

  /** Copilot: business agent drafts a reply (stored on the chat, not sent). */
  @Post('inbox/:chatId/draft')
  @Auth()
  async draft(@Param('chatId') chatId: string, @CurrentUser() user: DbUser) {
    await this.assertChatOwner(chatId, user);
    return ok(await this.tg.draft(chatId));
  }

  /** Runs after @Auth(): unauthenticated callers get 401 before any chat lookup (no existence probing). */
  private async assertChatOwner(chatId: string, user: DbUser): Promise<void> {
    await assertBusinessOwner(this.db, await this.tg.chatBusinessId(chatId), user);
  }
}
