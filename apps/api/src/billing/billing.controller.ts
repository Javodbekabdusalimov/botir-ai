import { BadRequestException, Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { AgentSearchDto, BillingMe, BillingSubscribeDto, SubscriptionResult } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ok } from '../common/http';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { AGENTS, type Agents } from '../negotiations/agents.provider';
import { agentSearch } from './agent-search';
import { BillingService } from './billing.service';

const MAX_TEXT_CHARS = 500;

@Controller()
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PrismaAgentStore) private readonly store: PrismaAgentStore,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  /** Plan, today's tokens, when they reset, prices. Bearer user, or `?userId=<guest id>` for a guest (always FREE). */
  @Get('billing/me')
  async me(@Headers('authorization') authorization?: string, @Query('userId') userId?: string) {
    return ok<BillingMe>(await this.billing.status(await this.billing.resolveOwner(authorization, userId)));
  }

  /** Pro/Max bill (incoming money only). The plan switches on when the payment is seen as paid in live mode. */
  @Post('billing/subscribe')
  @Auth()
  async subscribe(@CurrentUser() user: DbUser, @Body() dto: Partial<BillingSubscribeDto>) {
    return ok<SubscriptionResult>(await this.billing.subscribe(user, dto));
  }

  /** FREE and above: find businesses, address and catalog prices. No negotiation / discount / order / payment / Telegram. */
  @Post('agent/search')
  async search(@Body() dto: Partial<AgentSearchDto>, @Headers('authorization') authorization?: string) {
    const text = typeof dto?.text === 'string' ? dto.text.trim() : '';
    if (!text) throw new BadRequestException('text is required');
    if (text.length > MAX_TEXT_CHARS) throw new BadRequestException(`text is longer than ${MAX_TEXT_CHARS} characters`);
    const owner = await this.billing.requireOwner(authorization, dto.userId);
    await this.billing.assertSearchAllowed(owner); // 429 for FREE after the daily quota, before any AI call
    return ok(
      await agentSearch(
        {
          agent: this.agents.personalAgent,
          getProducts: (id) => this.store.getProducts(id),
          addressOf: (id) => this.db.business.findFirst({ where: { id, deletedAt: null }, select: { address: true, district: true } }),
        },
        text,
      ),
    );
  }
}
