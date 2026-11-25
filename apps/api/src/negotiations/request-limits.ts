// Abuse limits for POST /agent/request, all checked before any AI call. In-memory: per process, reset on restart.
import { HttpException, HttpStatus } from '@nestjs/common';

export const MAX_TEXT_CHARS = 500;
export const MAX_TASKS = 3;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_AT = 10_000; // keys kept in memory before stale ones are dropped

/** Positive integer from env, otherwise the fallback. */
export function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Start of the current calendar day in Tashkent, as a UTC Date. */
export function startOfTashkentDay(now = Date.now()): Date {
  return new Date(Math.floor((now + TASHKENT_OFFSET_MS) / DAY_MS) * DAY_MS - TASHKENT_OFFSET_MS);
}

export const tooMany = (message: string): HttpException => new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);

/** Sliding window: at most `limit` hits per key in `windowMs`. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    private readonly windowMs = RATE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** All keys under the limit → records one hit on each and returns true. Otherwise records nothing, returns false. */
  take(keys: string[]): boolean {
    const t = this.now();
    const recent = keys.map((k) => (this.hits.get(k) ?? []).filter((at) => t - at < this.windowMs));
    if (recent.some((r) => r.length >= this.limit)) return false;
    keys.forEach((k, i) => this.hits.set(k, [...recent[i], t]));
    if (this.hits.size > SWEEP_AT) this.sweep(t);
    return true;
  }

  private sweep(t: number): void {
    for (const [k, v] of this.hits) if (!v.some((at) => t - at < this.windowMs)) this.hits.delete(k);
  }
}
