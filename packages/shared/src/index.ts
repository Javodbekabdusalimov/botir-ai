// Umumiy tiplar va API kontrakti (web + api)
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type DebtKind = 'bank' | 'micro' | 'card' | 'nasiya' | 'personal_given' | 'personal_taken';

export interface Debt {
  id: string;
  kind: DebtKind;
  title: string;
  balance: number; // so'm
  rate: number; // yillik %
  monthly: number; // oylik to'lov, so'm
  dueDay: number; // oyning kuni (1-31)
}

export type PlanStrategy = 'avalanche' | 'snowball';
