import { Controller, Get, Inject, Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { TelegramAuthController } from './auth/telegram-auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { BusinessesController } from './businesses/businesses.controller';
import { AnalyticsService } from './businesses/analytics.service';
import { ok } from './common/http';
import { PrismaActionStore } from './db/prisma-action-store';
import { PrismaAgentStore } from './db/prisma-agent-store';
import { PrismaTgStore } from './db/prisma-tg-store';
import { PrismaService } from './db/prisma.service';
import { CatalogWriter } from './knowledge/catalog-writer.service';
import { KnowledgeFactsService } from './knowledge/facts.service';
import { KnowledgeController, SyncController } from './knowledge/knowledge.controller';
import { MetricsService } from './knowledge/metrics.service';
import { QuestionsService } from './knowledge/questions.service';
import { KnowledgeSourcesService } from './knowledge/sources.service';
import { SyncService } from './knowledge/sync.service';
import { TurnRecorder } from './knowledge/turn-recorder.service';
import { LoopController } from './loop/loop.controller';
import { agentsProvider } from './negotiations/agents.provider';
import { MemoryController } from './negotiations/memory.controller';
import { NegotiationsController } from './negotiations/negotiations.controller';
import { NegotiationsService } from './negotiations/negotiations.service';
import { PAYMENT_LINK } from './payments/payment-link';
import { PaymentPoller } from './payments/payment-poller.service';
import { PaymentSettlement } from './payments/payment-settlement.service';
import { PaymentsController } from './payments/payments.controller';
import { TestPayController } from './payments/test-pay.controller';
import { TestPaymentLinkProvider } from './payments/test-payment.provider';
import { TezcheckPaymentLinkProvider } from './payments/tezcheck-payment.provider';
import { MeTgController } from './tg/me-tg.controller';
import { TgController } from './tg/tg.controller';
import { TgUserService } from './tg/tg-user.service';
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
      payments: process.env.TEZCHECK_API_KEY ? 'tezcheck' : 'test-link',
      telegramBot: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      userbot: Boolean(process.env.TG_API_ID && process.env.TG_API_HASH && process.env.TG_SESSION_KEY),
    });
  }
}

@Module({
  controllers: [HealthController, AuthController, TelegramAuthController, BusinessesController, NegotiationsController, PaymentsController, TestPayController, TgController, MeTgController, LoopController, MemoryController, KnowledgeController, SyncController],
  providers: [
    PrismaService, AuthService, AuthGuard, PrismaAgentStore, PrismaTgStore, agentsProvider, AnalyticsService, NegotiationsService, TgService,
    PrismaActionStore, TgUserService, MetricsService, QuestionsService, TurnRecorder,
    CatalogWriter, KnowledgeSourcesService, KnowledgeFactsService, SyncService,
    TestPaymentLinkProvider, TezcheckPaymentLinkProvider, PaymentSettlement, PaymentPoller,
    // Real TezCheck bills when the key is configured; otherwise clearly-labeled TEST links.
    {
      provide: PAYMENT_LINK,
      useFactory: (tez: TezcheckPaymentLinkProvider, test: TestPaymentLinkProvider) => (process.env.TEZCHECK_API_KEY ? tez : test),
      inject: [TezcheckPaymentLinkProvider, TestPaymentLinkProvider],
    },
  ],
})
export class AppModule {}
