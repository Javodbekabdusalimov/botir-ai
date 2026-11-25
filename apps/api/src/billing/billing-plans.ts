// Billing helpers on top of payments/plans.ts (prices, daily tokens: see the cost math there).
// 1 token = $0.001 of REAL AI cost (LlmCall.costUsd, rounded up).
import type { BillingPrices } from '@botir/shared';
import { envInt } from '../negotiations/request-limits';
import { dailyTokens, maxPrice, PLAN_PERIOD_DAYS, proPrices, type PaidPlan } from '../payments/plans';

export { PLAN_PERIOD_DAYS };
export const USD_PER_TOKEN = 0.001;

/** Floating-point noise (0.003 / 0.001 = 3.0000000000000004) must not cost an extra token. */
export const tokensForCost = (costUsd: number): number =>
  Number.isFinite(costUsd) && costUsd > 0 ? Math.ceil(costUsd / USD_PER_TOKEN - 1e-9) : 0;

export const freeDailyRequests = (): number => envInt('PLAN_FREE_DAILY_REQUESTS', 3);

export const planPrice = (plan: PaidPlan, introAvailable: boolean): number =>
  plan === 'max' ? maxPrice() : introAvailable ? proPrices().intro : proPrices().full;

export const billingPrices = (): BillingPrices => ({
  pro: { price: proPrices().full, introPrice: proPrices().intro, dailyTokens: dailyTokens('pro') },
  max: { price: maxPrice(), dailyTokens: dailyTokens('max') },
  freeDailyRequests: freeDailyRequests(),
  periodDays: PLAN_PERIOD_DAYS,
});
