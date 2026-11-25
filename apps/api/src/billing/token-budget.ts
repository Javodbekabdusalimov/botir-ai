// Token math shared by billing and the LLM client. Framework-free on purpose: the agent layer (LlmClient) imports it.
// 1 token = 1 real Claude token of a call: input (fresh + cache read + cache write) + output, as logged on LlmCall.

const TASHKENT_OFFSET_MS = 5 * 3_600_000; // UTC+5, no DST

const count = (n: number | undefined): number => (n !== undefined && Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0);

/** Tokens debited for one call = Claude input + output tokens. */
export const llmTokens = (u: { inputTokens?: number; outputTokens?: number }): number => count(u.inputTokens) + count(u.outputTokens);

/** Tashkent calendar day key, e.g. "2026-11-25". */
export const dayKey = (now: Date): string => new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

/** AI_GLOBAL_DAILY_TOKENS: daily cap on ALL Claude tokens (one owner account, guests included). 0 = no cap. */
export function globalDailyTokens(): number {
  const raw = process.env.AI_GLOBAL_DAILY_TOKENS?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 0 ? n : 3_000_000;
}

/**
 * In-memory counter of today's Claude tokens (per process). Seeded once at startup from today's LlmCall rows,
 * then incremented after every logged call; a new Tashkent day starts from 0.
 */
export class GlobalTokenBudget {
  private day = '';
  private used = 0;

  constructor(private readonly cap: () => number = globalDailyTokens) {}

  /** Startup seed from the DB. max(): calls counted while the seed query ran are not counted twice. */
  seed(tokens: number, now = new Date()): void {
    this.roll(now);
    this.used = Math.max(this.used, count(tokens));
  }

  add(tokens: number, now = new Date()): void {
    this.roll(now);
    this.used += count(tokens);
  }

  exhausted(now = new Date()): boolean {
    const cap = this.cap();
    return cap > 0 && this.snapshot(now).used >= cap;
  }

  snapshot(now = new Date()): { used: number; cap: number } {
    this.roll(now);
    return { used: this.used, cap: this.cap() };
  }

  private roll(now: Date): void {
    const day = dayKey(now);
    if (day === this.day) return;
    this.day = day;
    this.used = 0;
  }
}
