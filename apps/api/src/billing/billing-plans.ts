// Billing helpers on top of payments/plans.ts (prices, daily tokens: see the cost math there).
import type { BillingPrices } from '@botir/shared';
import { envInt } from '../negotiations/request-limits';
import { dailyTokens, fullPrice, introPrice, PLAN_PERIOD_DAYS, type PaidPlan } from '../payments/plans';

export { PLAN_PERIOD_DAYS };
export { llmTokens } from './token-budget';

export const freeDailyRequests = (): number => envInt('PLAN_FREE_DAILY_REQUESTS', 3);

/** The first real paid month of ANY plan costs the intro price (once per account), then the plan's full price. */
export const planPrice = (plan: PaidPlan, introAvailable: boolean): number => (introAvailable ? introPrice() : fullPrice(plan));

export const billingPrices = (): BillingPrices => ({
  pro: { price: fullPrice('pro'), introPrice: introPrice(), dailyTokens: dailyTokens('pro') },
  max: { price: fullPrice('max'), introPrice: introPrice(), dailyTokens: dailyTokens('max') },
  freeDailyRequests: freeDailyRequests(),
  periodDays: PLAN_PERIOD_DAYS,
});
