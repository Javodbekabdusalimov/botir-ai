import { Controller, Get, Inject, Module } from '@nestjs/common';
import { BusinessesController } from './businesses/businesses.controller';
import { AnalyticsService } from './businesses/analytics.service';
import { ok } from './common/http';
import { PrismaAgentStore } from './db/prisma-agent-store';
import { PrismaTgStore } from './db/prisma-tg-store';
import { PrismaService } from './db/prisma.service';
import { LoopController } from './loop/loop.controller';
import { agentsProvider } from './negotiations/agents.provider';
import { NegotiationsController } from './negotiations/negotiations.controller';
import { NegotiationsService } from './negotiations/negotiations.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { TgController } from './tg/tg.controller';
import { TgService } from './tg/tg.service';

@Controller()
class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get('health')
  async health() {
    const businesses = await this.db.business.count({ where: { deletedAt: null } });
    return ok({
      status: 'ok',
      db: 'sqlite',
      businesses,
      tezcheck: process.env.TEZCHECK_API_KEY ? 'live' : 'test-link',
      telegramBot: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      userbot: Boolean(process.env.TG_API_ID && process.env.TG_API_HASH && process.env.TG_SESSION_KEY),
    });
  }
}

@Module({
  controllers: [HealthController, BusinessesController, NegotiationsController, PaymentsController, TgController, LoopController],
  providers: [
    PrismaService, PrismaAgentStore, PrismaTgStore, agentsProvider, AnalyticsService, PaymentsService, NegotiationsService, TgService,
  ],
})
export class AppModule {}
