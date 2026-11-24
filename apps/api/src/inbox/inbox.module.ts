import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import type { Chat, ChatMode, TgMessage } from '@prisma/client';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const CHAT_MODES = ['copilot', 'command', 'autopilot', 'off'] as const;

/** PolicyGuard rate limit from ARCHITECTURE section 3.4: 20 outbound messages per minute. */
const RATE_LIMIT_PER_MIN = 20;
const RATE_WINDOW_MS = 60_000;
const MESSAGE_PAGE_SIZE = 100;

export class ListInboxQuery {
  @IsString() businessId!: string;
}

export class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) text!: string;
}

export class SetModeDto {
  @IsEnum(CHAT_MODES) mode!: ChatMode;
}

@Injectable()
export class InboxService {
  private readonly outboundLog = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  async listChats(businessId: string, ownerUserId: string): Promise<Chat[]> {
    await this.assertBusinessOwner(businessId, ownerUserId);
    return this.prisma.chat.findMany({
      where: { isDeleted: false, tgAccount: { businessId, isDeleted: false } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async listMessages(chatId: string, ownerUserId: string): Promise<TgMessage[]> {
    await this.assertChatOwner(chatId, ownerUserId);
    return this.prisma.tgMessage.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { sentAt: 'asc' },
      take: MESSAGE_PAGE_SIZE,
    });
  }

  /**
   * Records an outbound message from the owner.
   *
   * Actual delivery to Telegram happens in the tg-connect layer (gramjs session),
   * which is not wired yet — this endpoint is the queue plus the policy gate, so
   * the row is stored as the source of truth for what should be sent.
   */
  async send(chatId: string, ownerUserId: string, text: string): Promise<TgMessage> {
    const chat = await this.assertChatOwner(chatId, ownerUserId);

    if (chat.mode === 'off') throw new ForbiddenException('chat mode is off');
    this.assertRateLimit(chat.tgAccountId);

    const [message] = await this.prisma.$transaction([
      this.prisma.tgMessage.create({
        data: { chatId, direction: 'out', author: 'owner', text },
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date(), lastMessageText: text, needsHuman: false },
      }),
    ]);

    return message;
  }

  async setMode(chatId: string, ownerUserId: string, mode: ChatMode): Promise<Chat> {
    await this.assertChatOwner(chatId, ownerUserId);
    return this.prisma.chat.update({ where: { id: chatId }, data: { mode } });
  }

  private assertRateLimit(tgAccountId: string): void {
    const now = Date.now();
    const recent = (this.outboundLog.get(tgAccountId) ?? []).filter(
      (stamp) => now - stamp < RATE_WINDOW_MS,
    );

    if (recent.length >= RATE_LIMIT_PER_MIN) {
      throw new ForbiddenException('rate limit: 20 messages per minute per account');
    }

    recent.push(now);
    this.outboundLog.set(tgAccountId, recent);
  }

  private async assertChatOwner(chatId: string, ownerUserId: string): Promise<Chat> {
    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, isDeleted: false },
      include: { tgAccount: { include: { business: true } } },
    });
    if (!chat) throw new NotFoundException('chat not found');
    if (chat.tgAccount.business.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('not your chat');
    }
    return chat;
  }

  private async assertBusinessOwner(businessId: string, ownerUserId: string): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, isDeleted: false },
    });
    if (!business) throw new NotFoundException('business not found');
    if (business.ownerUserId !== ownerUserId) throw new ForbiddenException('not your business');
  }
}

@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListInboxQuery): Promise<Chat[]> {
    return this.inbox.listChats(query.businessId, req.userId as string);
  }

  @Get(':chatId/messages')
  messages(@Req() req: AuthedRequest, @Param('chatId') chatId: string): Promise<TgMessage[]> {
    return this.inbox.listMessages(chatId, req.userId as string);
  }

  @Post(':chatId/send')
  send(
    @Req() req: AuthedRequest,
    @Param('chatId') chatId: string,
    @Body() dto: SendMessageDto,
  ): Promise<TgMessage> {
    return this.inbox.send(chatId, req.userId as string, dto.text);
  }

  @Patch(':chatId/mode')
  setMode(
    @Req() req: AuthedRequest,
    @Param('chatId') chatId: string,
    @Body() dto: SetModeDto,
  ): Promise<Chat> {
    return this.inbox.setMode(chatId, req.userId as string, dto.mode);
  }
}

@Module({
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
