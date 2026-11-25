// Botir revenue = monthly business subscription. No commission/percentage anywhere.
import type { Business as DbBusiness } from '@prisma/client';
import type { BusinessPlanStatus, Plan, PlanId } from '@botir/shared';

const envInt = (key: string, fallback: number): number => {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const PLAN_PERIOD_DAYS = 30;

export const PAID_PLANS = ['pro', 'max'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type EffectivePlan = 'free' | PaidPlan;
export const isPaidPlan = (v: unknown): v is PaidPlan => v === 'pro' || v === 'max';

// Tokens: 1 token = $0.001 of real AI cost, a DAILY allowance (resets 00:00 Asia/Tashkent). Plans last 30 days per payment.
// Price = worst-case monthly AI cost + 20%, at ~12 000 so'm per $:
//   PRO: 150 tokens/day x 30 = 4 500 tokens = $4.5 -> ~54 000 so'm x 1.2 = ~65 000 so'm   (PLAN_PRO_PRICE)
//   MAX: 500 tokens/day x 30 = 15 000 tokens = $15 -> ~180 000 so'm x 1.2 = ~216 000, set to 219 000 (PLAN_MAX_PRICE)
// The first PRO month per account costs PLAN_PRO_INTRO_PRICE (1 000 so'm, TezCheck minimum).
export const dailyTokens = (plan: EffectivePlan): number =>
  plan === 'pro' ? envInt('PLAN_PRO_DAILY_TOKENS', 150) : plan === 'max' ? envInt('PLAN_MAX_DAILY_TOKENS', 500) : 0;

export const maxPrice = (): number => envInt('PLAN_MAX_PRICE', 219000);

/** Pro: the first paid month costs `intro` (once per account), every next 30 days cost `full`. */
export const proPrices = (): { intro: number; full: number } => ({
  intro: envInt('PLAN_PRO_INTRO_PRICE', 1000), // TezCheck minimum
  full: envInt('PLAN_PRO_PRICE', 65000),
});

export const plans = (): Plan[] => [
  { id: 'free', name: 'Free', price: 0, aiCredits: envInt('PLAN_START_CREDITS', 100), dailyTokens: 0, periodDays: PLAN_PERIOD_DAYS },
  { id: 'pro', name: 'Pro', price: proPrices().full, introPrice: proPrices().intro, aiCredits: envInt('PLAN_PRO_CREDITS', 1000), dailyTokens: dailyTokens('pro'), periodDays: PLAN_PERIOD_DAYS },
  { id: 'max', name: 'Max', price: maxPrice(), aiCredits: envInt('PLAN_PRO_CREDITS', 1000), dailyTokens: dailyTokens('max'), periodDays: PLAN_PERIOD_DAYS },
];

/** 'start' is the legacy alias of 'free'. */
export const planById = (id: PlanId): Plan | undefined => plans().find((p) => p.id === (id === 'start' ? 'free' : id));

/** Pro counts only until planUntil (each paid month adds 30 days); after that the business is back on Free. */
export const effectivePlan = (b: Pick<DbBusiness, 'plan' | 'planUntil'>, now = new Date()): PlanId =>
  b.plan === 'pro' && b.planUntil != null && b.planUntil > now ? 'pro' : 'free';

/**
 * `paidSubscriptions` = paid Pro months of this business in the current payment mode (real TezCheck, or TEST links when
 * TEZCHECK_API_KEY is unset), so a TEST payment never uses up the real intro price.
 */
export function planStatus(b: Pick<DbBusiness, 'plan' | 'planUntil'>, paidSubscriptions: number, now = new Date()): BusinessPlanStatus {
  const { intro, full } = proPrices();
  const introAvailable = paidSubscriptions === 0;
  return {
    plan: effectivePlan(b, now),
    expiresAt: b.planUntil?.toISOString() ?? null,
    introPrice: intro,
    fullPrice: full,
    nextPrice: introAvailable ? intro : full,
    introAvailable,
  };
}
