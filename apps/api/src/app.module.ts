import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthModule } from './health/health.module';
import { InboxModule } from './inbox/inbox.module';
import { NegotiationsModule } from './negotiations/negotiations.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    BusinessesModule,
    CatalogModule,
    OrdersModule,
    AnalyticsModule,
    InboxModule,
    NegotiationsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
