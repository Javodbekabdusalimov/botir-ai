// Billing helpers on top of payments/plans.ts (prices, daily tokens: see the cost math there).
// 1 token = 1 real Claude token of a call: input (fresh + cache read + cache write) + output, as logged on LlmCall.
import type { BillingPrices } from '@botir/shared';
import { envInt } from '../negotiations/request-limits';
import { dailyTokens, maxPrice, PLAN_PERIOD_DAYS, proPrices, type PaidPlan } from '../payments/plans';

export { PLAN_PERIOD_DAYS };

const count = (n: number | undefined): number => (n !== undefined && Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0);

/** Tokens debited for one call = Claude input + output tokens. */
export const llmTokens = (u: { inputTokens?: number; outputTokens?: number }): number => count(u.inputTokens) + count(u.outputTokens);

export const freeDailyRequests = (): number => envInt('PLAN_FREE_DAILY_REQUESTS', 3);

export const planPrice = (plan: PaidPlan, introAvailable: boolean): number =>
  plan === 'max' ? maxPrice() : introAvailable ? proPrices().intro : proPrices().full;

export const billingPrices = (): BillingPrices => ({
  pro: { price: proPrices().full, introPrice: proPrices().intro, dailyTokens: dailyTokens('pro') },
  max: { price: maxPrice(), dailyTokens: dailyTokens('max') },
  freeDailyRequests: freeDailyRequests(),
  periodDays: PLAN_PERIOD_DAYS,
});
