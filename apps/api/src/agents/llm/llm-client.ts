import { query, type SDKMessage, type SDKRateLimitInfo, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { currentBillingOwner, type BillingOwner } from '../../billing/billing-context';
import { GlobalTokenBudget, llmTokens } from '../../billing/token-budget';
import type { AgentStore } from '../store/agent-store';
import type { AgentLogger } from '../logger';
import { silentLogger } from '../logger';
import type { LlmCallRecord, LlmErrorKind, LlmModel } from '../types';
import { runCli, usageOf, parseCliRun, type AttemptResult, type CallUsage, type CliRun, type CliRunner } from './cli-run';
import { classifyError, LlmError, looksLikeError, RETRYABLE } from './llm-error';
import { envInt, FALLBACK_MODEL, resolveEffort, resolveModel, type LlmEffort } from './llm-policy';
import { Semaphore } from './semaphore';

export { LlmError, LLM_USER_ERROR } from './llm-error';
export { parseCliRun, type CliRun, type CliRunner } from './cli-run';
export { MODEL_POLICY, resolveEffort, resolveModel, type LlmEffort } from './llm-policy';

export interface LlmAttachment {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  base64: string;
}

export interface CompleteInput {
  system: string;
  prompt: string;
  model: LlmModel; // the caller's choice; MODEL_POLICY / LLM_MODEL_<PURPOSE> win for listed purposes
  json?: boolean;
  purpose?: string; // for LlmCall log ("business_agent", "parser", ...)
  attachments?: LlmAttachment[]; // images / PDFs, sdk mode only
}

export interface CompleteOutput {
  text: string;
  ms: number;
}

/** Seam for tests: the real SDK query() or a fake message stream. */
export type SdkQuery = (params: Parameters<typeof query>[0]) => AsyncIterable<SDKMessage>;


export interface LlmClientOptions {
  store: AgentStore;
  logger?: AgentLogger;
  /** 'sdk' = @anthropic-ai/claude-agent-sdk query(); 'cli' = `claude -p` subprocess. */
  mode?: 'sdk' | 'cli';
  claudePath?: string;
  /** Per attempt. Env LLM_TIMEOUT_MS, default 60 000 (the web waits 60 s). */
  timeoutMs?: number;
  /** Own gate (tests). Default: one process-wide gate, env LLM_MAX_CONCURRENCY (2). */
  maxConcurrency?: number;
  /** Max wait for a free slot. Env LLM_QUEUE_TIMEOUT_MS, default 60 000. */
  queueTimeoutMs?: number;
  sdkQuery?: SdkQuery;
  cliRunner?: CliRunner;
  /** Billing hook: called after every logged call that has token usage and a billing owner. Failures are swallowed. */
  onCost?: OnCost;
  /** Daily cap on all Claude tokens (AI_GLOBAL_DAILY_TOKENS). Default: own in-memory counter. */
  budget?: GlobalTokenBudget;
}

export type OnCost = (owner: BillingOwner, usage: { inputTokens?: number; outputTokens?: number; costUsd?: number }) => Promise<void> | void;

export type AiHealth = 'ok' | 'limited' | 'down' | 'unknown';

export interface RateLimitStatus {
  type: string; // five_hour | seven_day | ...
  status: SDKRateLimitInfo['status'];
  utilization?: number; // 0..1
  resetsAt?: string;
  at: string;
}

export interface AiStatus {
  ai: AiHealth;
  lastKind: LlmErrorKind | null;
  lastAt: string | null;
  rateLimits: RateLimitStatus[];
}


/** Detail (logs only) of the fail-fast error once AI_GLOBAL_DAILY_TOKENS is used up; users see LLM_USER_ERROR. */
export const GLOBAL_BUDGET_DETAIL = 'AI_GLOBAL_DAILY_TOKENS reached: no new AI calls until 00:00 Asia/Tashkent';

const JSON_HINT =
  '\n\nJavobni FAQAT bitta JSON obyekt sifatida qaytar. Markdown, ``` yoki izoh yozma.';
const RATE_WARN_AT = 0.8;

// Every claude process costs ~130-260 MB: one gate for the whole process (Render Free = 512 MB).
let processGate: Semaphore | undefined;

/**
 * Pure completion over the owner's Claude login (no tools, 1 turn, no filesystem settings/hooks).
 * Process-wide concurrency gate, per-attempt timeout, one retry, cheaper fallback model, typed LlmError.
 * Every attempt is logged to store.saveLlmCall (model actually used, ok, errorKind, tokens, cost).
 */
export class LlmClient {
  private readonly store: AgentStore;
  private readonly logger: AgentLogger;
  private readonly mode: 'sdk' | 'cli';
  private readonly claudePath: string;
  private readonly timeoutMs: number;
  private readonly queueTimeoutMs: number;
  private readonly gate: Semaphore;
  private readonly sdkQuery: SdkQuery;
  private readonly cliRunner: CliRunner;
  private onCost: OnCost | undefined;
  private readonly budget: GlobalTokenBudget;
  private last: { ok: boolean; kind?: LlmErrorKind; at: string } | undefined;
  private readonly rateLimits = new Map<string, RateLimitStatus>();

  constructor(opts: LlmClientOptions) {
    this.store = opts.store;
    this.logger = opts.logger ?? silentLogger;
    this.mode = opts.mode ?? 'sdk';
    this.claudePath = opts.claudePath ?? process.env.CLAUDE_PATH ?? 'claude';
    this.timeoutMs = opts.timeoutMs ?? envInt('LLM_TIMEOUT_MS', 60_000);
    this.queueTimeoutMs = opts.queueTimeoutMs ?? envInt('LLM_QUEUE_TIMEOUT_MS', 60_000);
    this.gate = opts.maxConcurrency
      ? new Semaphore(opts.maxConcurrency)
      : (processGate ??= new Semaphore(envInt('LLM_MAX_CONCURRENCY', 2)));
    this.sdkQuery = opts.sdkQuery ?? query;
    this.cliRunner = opts.cliRunner ?? runCli;
    this.onCost = opts.onCost;
    this.budget = opts.budget ?? new GlobalTokenBudget();
  }

  /** Startup seed of today's global token counter (BillingService reads today's LlmCall rows). */
  seedGlobalTokens(tokens: number, now = new Date()): void {
    this.budget.seed(tokens, now);
  }

  /** Today's Claude tokens of all calls vs AI_GLOBAL_DAILY_TOKENS (0 = no cap). */
  globalTokens(now = new Date()): { used: number; cap: number } {
    return this.budget.snapshot(now);
  }

  /** Late wiring (the Nest agents factory builds the client before BillingService exists). */
  setOnCost(hook: OnCost | undefined): void {
    this.onCost = hook;
  }

  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const { text, ms } = await this.run(input, (t) => t);
    return { text, ms };
  }

  /** complete() + parse JSON (tolerates ```json fences / leading prose). Unparseable output counts as a failed attempt. */
  async completeJson<T>(input: Omit<CompleteInput, 'json'>): Promise<{ data: T; ms: number }> {
    const { value, ms } = await this.run({ ...input, json: true }, (t) => parseJsonLoose<T>(t));
    return { data: value, ms };
  }

  /** For /health: outcome of the last attempt + the last rate-limit event per window. */
  status(): AiStatus {
    const ai: AiHealth = !this.last ? 'unknown' : this.last.ok ? 'ok' : this.last.kind === 'limit' ? 'limited' : 'down';
    return { ai, lastKind: this.last?.kind ?? null, lastAt: this.last?.at ?? null, rateLimits: [...this.rateLimits.values()] };
  }

  /** Queue → attempt (retry once on timeout / overloaded / bad output) → cheaper fallback model → LlmError. */
  private async run<R>(input: CompleteInput, parse: (text: string) => R): Promise<{ value: R; text: string; ms: number }> {
    if (this.mode === 'cli' && input.attachments?.length) throw new Error('LLM attachments need LLM_MODE=sdk (cli mode is text only)');
    const started = Date.now();
    const system = input.json ? input.system + JSON_HINT : input.system;
    const model = resolveModel(input.purpose, input.model);
    const fallback = FALLBACK_MODEL[model];
    const plan: LlmModel[] = fallback ? [model, model, fallback] : [model, model];
    // Fail fast before queueing: same typed error (kind 'limit', not retried) as a provider usage limit.
    if (this.budget.exhausted()) {
      const err = new LlmError('limit', GLOBAL_BUDGET_DETAIL);
      await this.record(model, input, 0, 0, {}, err);
      throw err;
    }

    let release: () => void;
    try {
      release = await this.gate.acquire(this.queueTimeoutMs);
    } catch (e) {
      const err = e instanceof LlmError ? e : new LlmError('other', errMsg(e));
      await this.record(model, input, 0, Date.now() - started, {}, err);
      throw err;
    }
    try {
      let lastErr = new LlmError('other', 'no attempt');
      for (const m of plan) {
        const t0 = Date.now();
        let text = '';
        let usage: CallUsage = {};
        try {
          ({ text, usage } = await this.attempt(m, system, input));
          const value = parse(text);
          await this.record(m, input, system.length + input.prompt.length + text.length, Date.now() - t0, usage);
          return { value, text, ms: Date.now() - started };
        } catch (e) {
          lastErr = e instanceof LlmError ? e : new LlmError('bad_output', errMsg(e));
          await this.record(m, input, system.length + input.prompt.length + text.length, Date.now() - t0, usage, lastErr);
          if (!RETRYABLE.has(lastErr.kind)) break;
        }
      }
      throw lastErr;
    } finally {
      release();
    }
  }

  private attempt(model: LlmModel, system: string, input: CompleteInput): Promise<AttemptResult> {
    const effort = resolveEffort(input.purpose);
    return this.mode === 'sdk' ? this.viaSdk(model, effort, system, input) : this.viaCli(model, effort, system, input);
  }

  /** Log line + LlmCall row. Never throws: a logging failure must not change the call's outcome. */
  private async record(model: LlmModel, input: CompleteInput, chars: number, ms: number, usage: CallUsage, err?: LlmError): Promise<void> {
    const at = new Date().toISOString();
    this.last = { ok: !err, kind: err?.kind, at };
    const purpose = input.purpose ?? 'unknown';
    if (err) {
      this.logger.warn(`[llm] ${model} ${purpose} ${ms}ms ok=false kind=${err.kind}: ${err.detail.slice(0, 300)}`);
    } else {
      const tokens = usage.inputTokens !== undefined ? ` in=${usage.inputTokens} out=${usage.outputTokens ?? 0}` : '';
      const cost = usage.costUsd !== undefined ? ` $${usage.costUsd.toFixed(4)}` : '';
      this.logger.log(`[llm] ${model} ${purpose} ${ms}ms ok=true${tokens}${cost}`);
    }
    this.budget.add(llmTokens(usage));
    const owner = currentBillingOwner();
    const ownerCols = owner ? (owner.ownerType === 'business' ? { businessId: owner.ownerId } : { userId: owner.ownerId }) : {};
    const row: LlmCallRecord = { model, ms, chars, purpose, ok: !err, at, ...(err ? { errorKind: err.kind } : {}), ...usage, ...ownerCols };
    try {
      await this.store.saveLlmCall(row);
    } catch (e) {
      this.logger.warn(`[llm] saveLlmCall failed: ${errMsg(e).slice(0, 200)}`);
    }
    if (owner && this.onCost && (usage.inputTokens || usage.outputTokens)) {
      try {
        await this.onCost(owner, usage);
      } catch (e) {
        this.logger.warn(`[llm] onCost failed: ${errMsg(e).slice(0, 200)}`);
      }
    }
  }

  private noteRateLimit(info: SDKRateLimitInfo): void {
    const type = info.rateLimitType ?? 'unknown';
    const resetsAt = info.resetsAt ? new Date(info.resetsAt * 1000).toISOString() : undefined;
    this.rateLimits.set(type, { type, status: info.status, utilization: info.utilization, resetsAt, at: new Date().toISOString() });
    const used = info.utilization !== undefined ? `${Math.round(info.utilization * 100)}%` : '?';
    const line = `[llm] rate limit ${type} ${info.status} used=${used} resets=${resetsAt ?? '-'}`;
    if (info.status !== 'allowed' || (info.utilization ?? 0) >= RATE_WARN_AT) this.logger.warn(line);
    else this.logger.log(line);
  }

  private async viaSdk(model: LlmModel, effort: LlmEffort, system: string, input: CompleteInput): Promise<AttemptResult> {
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, this.timeoutMs);
    let sdkError: string | undefined;
    try {
      const q = this.sdkQuery({
        prompt: input.attachments?.length ? userMessage(input.prompt, input.attachments) : input.prompt,
        options: {
          model,
          effort,
          systemPrompt: system,
          maxTurns: 1,
          tools: [],
          settingSources: [],
          persistSession: false,
          abortController: abort,
          pathToClaudeCodeExecutable: process.env.CLAUDE_PATH,
        },
      });
      for await (const msg of q) {
        if (msg.type === 'rate_limit_event') this.noteRateLimit(msg.rate_limit_info);
        else if (msg.type === 'assistant' && msg.error) sdkError = msg.error;
        else if (msg.type === 'result') {
          if (msg.subtype !== 'success') {
            const text = msg.errors.join('; ');
            throw new LlmError(classifyError({ text, sdkError }), `${msg.subtype}: ${text || '(no text)'}`);
          }
          if (msg.is_error || looksLikeError(msg.result)) {
            throw new LlmError(classifyError({ text: msg.result, status: msg.api_error_status, sdkError }), msg.result || '(empty error)');
          }
          return { text: msg.result, usage: usageOf(msg) };
        }
      }
      throw new LlmError('other', 'no result message');
    } catch (e) {
      if (timedOut) throw new LlmError('timeout', `no answer in ${this.timeoutMs}ms`);
      throw e instanceof LlmError ? e : new LlmError(classifyError({ text: errMsg(e), sdkError }), errMsg(e));
    } finally {
      clearTimeout(timer);
    }
  }

  private async viaCli(model: LlmModel, effort: LlmEffort, system: string, input: CompleteInput): Promise<AttemptResult> {
    const args = [
      '-p',
      '--model', model,
      '--effort', effort,
      '--output-format', 'json',
      '--max-turns', '1',
      '--tools', '',
      '--setting-sources', '',
      '--no-session-persistence',
      '--system-prompt', system,
    ];
    let run: CliRun;
    try {
      run = await this.cliRunner(this.claudePath, args, input.prompt, this.timeoutMs);
    } catch (e) {
      throw new LlmError('other', `claude -p spawn: ${errMsg(e)}`);
    }
    return parseCliRun(run, this.timeoutMs);
  }
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** One user turn with image/document blocks (a plain string prompt cannot carry files). */
async function* userMessage(prompt: string, attachments: LlmAttachment[]): AsyncGenerator<SDKUserMessage> {
  const files = attachments.map(({ mediaType, base64 }) =>
    mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } },
  );
  yield {
    type: 'user',
    message: { role: 'user', content: [...files, { type: 'text', text: prompt }] },
    parent_tool_use_id: null,
  };
}

export function parseJsonLoose<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`LLM returned no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}
