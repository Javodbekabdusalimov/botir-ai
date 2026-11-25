// Billing wiring, spread into AppModule (apps/api/src/app.module.ts): a separate @Module could not reuse AppModule's
// PrismaService / AuthService / AGENTS / PAYMENT_LINK providers without creating a second PrismaClient.
import { RequestMethod, type MiddlewareConsumer, type Provider, type Type } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingMiddleware } from './billing.middleware';
import { BillingService } from './billing.service';

export const BILLING_CONTROLLERS: Type[] = [BillingController];
export const BILLING_PROVIDERS: Provider[] = [BillingService];

/** Every POST gets the billing owner context; the PRO routes are gated inside the middleware (no controller edits). */
export function configureBilling(consumer: MiddlewareConsumer): void {
  consumer.apply(BillingMiddleware).forRoutes({ path: '*path', method: RequestMethod.POST });
}
