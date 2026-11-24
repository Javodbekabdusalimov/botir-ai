// Botir revenue = monthly business subscription. No commission/percentage anywhere.
import type { Plan, PlanId } from '@botir/shared';

const envInt = (key: string, fallback: number): number => {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const PLAN_PERIOD_DAYS = 30;

export const plans = (): Plan[] => [
  { id: 'start', name: 'Start', price: 0, aiCredits: envInt('PLAN_START_CREDITS', 100), periodDays: PLAN_PERIOD_DAYS },
  // 1 000 so'm for now (TezCheck minimum); real price later via PLAN_PRO_PRICE.
  { id: 'pro', name: 'Pro', price: envInt('PLAN_PRO_PRICE', 1000), aiCredits: envInt('PLAN_PRO_CREDITS', 1000), periodDays: PLAN_PERIOD_DAYS },
];

export const planById = (id: PlanId): Plan | undefined => plans().find((p) => p.id === id);
