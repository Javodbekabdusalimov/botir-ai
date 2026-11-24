import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { ChatMode, SendMessageDto, SetModeDto, TgConnectCodeDto, TgConnectStartDto } from '@botir/shared';
import { ok } from '../common/http';
import { TgService } from './tg.service';

const MODES: ChatMode[] = ['copilot', 'command', 'autopilot', 'off'];

@Controller()
export class TgController {
  constructor(@Inject(TgService) private readonly tg: TgService) {}

  @Post('tg-connect/start')
  async start(@Body() dto: TgConnectStartDto) {
    if (!dto?.businessId || !dto.phone) throw new BadRequestException('businessId and phone are required');
    return ok(await this.tg.start(dto.businessId, dto.phone));
  }

  @Post('tg-connect/code')
  async code(@Body() dto: TgConnectCodeDto) {
    if (!dto?.loginId || !dto.code) throw new BadRequestException('loginId and code are required');
    return ok(await this.tg.code(dto.loginId, dto.code, dto.password));
  }

  @Delete('tg-connect')
  async disconnect(@Query('businessId') businessId: string) {
    if (!businessId) throw new BadRequestException('businessId is required');
    return ok(await this.tg.disconnect(businessId));
  }

  @Get('inbox')
  async inbox(@Query('businessId') businessId: string) {
    if (!businessId) throw new BadRequestException('businessId is required');
    return ok(await this.tg.chats(businessId));
  }

  @Get('inbox/:chatId/messages')
  async messages(@Param('chatId') chatId: string) {
    return ok(await this.tg.messages(chatId));
  }

  @Post('inbox/:chatId/send')
  async send(@Param('chatId') chatId: string, @Body() dto: SendMessageDto) {
    return ok(await this.tg.send(chatId, dto?.text));
  }

  @Patch('inbox/:chatId/mode')
  async mode(@Param('chatId') chatId: string, @Body() dto: SetModeDto) {
    if (!MODES.includes(dto?.mode)) throw new BadRequestException(`mode must be one of ${MODES.join('|')}`);
    return ok(await this.tg.setMode(chatId, dto.mode));
  }

  /** Copilot: business agent drafts a reply (stored on the chat, not sent). */
  @Post('inbox/:chatId/draft')
  async draft(@Param('chatId') chatId: string) {
    return ok(await this.tg.draft(chatId));
  }
}
