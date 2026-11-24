// TezCheck merchant API client — INCOMING ONLY. Exactly two calls: create a bill, read a bill.
// No cancel/refund/payout/withdraw/transfer by design (owner's rule). The API key is never logged or returned.
// Docs: https://tezcheck.uz/api-docs (amounts in tiyin: 1 so'm = 100).

const DEFAULT_BASE = 'https://api.tezcheck.uz/api/merchant/v1';
const TIMEOUT_MS = 15_000;

export interface TezcheckBill {
  id: string;
  state: string; // draft | active | paused | expired | exhausted | revoked
  amount_minor: number;
  external_reference?: string | null;
  paid?: boolean; // read only: branch on this, never on state
  livemode?: boolean; // false → paid via the "Test provider", not real money
  paid_at?: string | null;
}

export interface CreatedBill {
  bill: TezcheckBill;
  payment_url: string; // returned ONCE — store it
}

export interface BillStatus {
  bill: TezcheckBill;
  payment: { state: string; amount_minor: number; livemode: boolean } | null;
}

export class TezcheckError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryable: boolean) {
    super(`TezCheck ${code} (HTTP ${status})`);
  }
}

interface ErrorBody {
  error?: { code?: string; retryable?: boolean };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TezcheckClient {
  private constructor(private readonly base: string, private readonly key: string, private readonly desk: string) {}

  /** null when TEZCHECK_API_KEY / TEZCHECK_CASH_DESK_CODE are not configured. */
  static fromEnv(): TezcheckClient | null {
    const key = process.env.TEZCHECK_API_KEY?.trim();
    const desk = process.env.TEZCHECK_CASH_DESK_CODE?.trim();
    if (!key || !desk) return null;
    return new TezcheckClient((process.env.TEZCHECK_API_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ''), key, desk);
  }

  /** POST /bills. Same idempotencyKey → TezCheck replays the first bill instead of creating a second one. */
  createBill(input: { amountMinor: number; title: string; externalReference: string; idempotencyKey: string }): Promise<CreatedBill> {
    return this.post<CreatedBill>('/bills', {
      amount_minor: input.amountMinor,
      title: input.title,
      external_reference: input.externalReference,
    }, { 'Idempotency-Key': input.idempotencyKey });
  }

  /** POST /bills/{bill} — read-only status ("so'rab olish"). */
  readBill(billId: string): Promise<BillStatus> {
    return this.post<BillStatus>(`/bills/${encodeURIComponent(billId)}`);
  }

  private async post<T>(path: string, body?: object, extra: Record<string, string> = {}): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.key}`,
          'X-Cash-Desk-Code': this.desk,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: T } & ErrorBody;
      if (res.ok && json.data) return json.data;
      const code = json.error?.code ?? 'unknown';
      // 409 resource.conflict = same Idempotency-Key still in flight; 429/5xx are retryable. Max 3 attempts.
      const retryable = json.error?.retryable === true || code === 'resource.conflict' || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 3) throw new TezcheckError(res.status, code, retryable);
      await sleep(1000 * attempt);
    }
  }
}
