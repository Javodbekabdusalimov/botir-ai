// Run: pnpm exec tsx apps/api/src/agents/llm/llm-client.test.ts  (no network, no real claude, no DB)
import { strict as assert } from 'node:assert';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentLogger } from '../logger';
import { MemoryStore } from '../store/memory-store';
import { LLM_USER_ERROR, LlmClient, LlmError, resolveEffort, resolveModel, type CliRun, type LlmClientOptions, type SdkQuery } from './llm-client';

type Params = Parameters<SdkQuery>[0];
/** One fake SDK call: receives the query params, returns the messages it streams. */
type Script = (p: Params) => Promise<Record<string, unknown>[]>;

const msg = (m: Record<string, unknown>): SDKMessage => m as unknown as SDKMessage;
const ok = (result: string, extra: Record<string, unknown> = {}) => ({ type: 'result', subtype: 'success', is_error: false, result, ...extra });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeSdk(scripts: Script[]): { sdkQuery: SdkQuery; calls: Params[] } {
  const calls: Params[] = [];
  const sdkQuery: SdkQuery = (p) => {
    const script = scripts[Math.min(calls.length, scripts.length - 1)];
    calls.push(p);
    return (async function* () {
      for (const m of await script(p)) yield msg(m);
    })();
  };
  return { sdkQuery, calls };
}

function client(sdkQuery: SdkQuery, over: Partial<LlmClientOptions> = {}) {
  const store = new MemoryStore(false);
  const warns: string[] = [];
  const logger: AgentLogger = { log: () => undefined, warn: (m) => void warns.push(m), error: () => undefined };
  return { llm: new LlmClient({ store, logger, sdkQuery, maxConcurrency: 4, ...over }), store, warns };
}

const ask = { system: 's', prompt: 'p' };

async function main(): Promise<void> {
  // 1. is_error result → typed LlmError(auth), not retried, raw text only in the log, ok=false row
  {
    const raw = 'Failed to authenticate. API Error: 401 OAuth access token is invalid.';
    const { sdkQuery, calls } = fakeSdk([async () => [
      { type: 'assistant', error: 'authentication_failed', message: {} },
      ok(raw, { is_error: true, api_error_status: 401 }),
    ]]);
    const { llm, store, warns } = client(sdkQuery);
    assert.equal(llm.status().ai, 'unknown');
    const err = await llm.completeJson({ ...ask, model: 'haiku', purpose: 'parser' }).catch((e: unknown) => e);
    assert.ok(err instanceof LlmError && err.kind === 'auth', 'auth kind');
    assert.equal(err.message, LLM_USER_ERROR, 'users never see the raw provider text');
    assert.ok(!err.message.includes('OAuth'));
    assert.equal(calls.length, 1, 'auth is not retried');
    assert.deepEqual(store.llmCalls.map((c) => [c.ok, c.errorKind]), [[false, 'auth']]);
    assert.ok(warns.some((w) => w.includes('OAuth access token')), 'raw text goes to the log');
    assert.equal(llm.status().ai, 'down');
  }
  // 1b. error text inside a "success" result (weekly limit) → limit, /health says limited
  {
    const { sdkQuery } = fakeSdk([async () => [ok("You've hit your weekly limit · resets 8am (Asia/Tashkent)")]]);
    const { llm, store } = client(sdkQuery);
    await assert.rejects(llm.completeJson({ ...ask, model: 'sonnet', purpose: 'business_agent' }), (e: unknown) => e instanceof LlmError && e.kind === 'limit');
    assert.equal(store.llmCalls.length, 1, 'limit is not retried and does not fall back');
    assert.equal(llm.status().ai, 'limited');
  }
  // 2. retry then success: unparseable JSON once, then valid JSON
  {
    const { sdkQuery, calls } = fakeSdk([async () => [ok('kechirasiz, JSON emas')], async () => [ok('{"a":1}')]]);
    const { llm, store } = client(sdkQuery);
    const { data } = await llm.completeJson<{ a: number }>({ ...ask, model: 'haiku', purpose: 'parser' });
    assert.deepEqual(data, { a: 1 });
    assert.equal(calls.length, 2);
    assert.deepEqual(store.llmCalls.map((c) => [c.model, c.ok, c.errorKind]), [['haiku', false, 'bad_output'], ['haiku', true, undefined]]);
    assert.equal(llm.status().ai, 'ok');
  }
  // 3. fallback: sonnet overloaded twice ("API Error: 529" text) → haiku answers; haiku never falls back to sonnet
  {
    const overloaded = async () => [ok('API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}')];
    const { sdkQuery, calls } = fakeSdk([overloaded, overloaded, async () => [ok('{"reply":"ok"}')]]);
    const { llm, store } = client(sdkQuery);
    const { data } = await llm.completeJson<{ reply: string }>({ ...ask, model: 'sonnet', purpose: 'business_agent' });
    assert.equal(data.reply, 'ok');
    assert.deepEqual(calls.map((c) => c.options?.model), ['sonnet', 'sonnet', 'haiku']);
    assert.deepEqual(store.llmCalls.map((c) => [c.model, c.errorKind]), [['sonnet', 'overloaded'], ['sonnet', 'overloaded'], ['haiku', undefined]]);

    const h = fakeSdk([overloaded]);
    const hc = client(h.sdkQuery);
    await assert.rejects(hc.llm.completeJson({ ...ask, model: 'haiku', purpose: 'parser' }), (e: unknown) => e instanceof LlmError && e.kind === 'overloaded');
    assert.deepEqual(h.calls.map((c) => c.options?.model), ['haiku', 'haiku'], 'never a more expensive fallback');
  }
  // 4. semaphore: never more than maxConcurrency calls at once; FIFO waiters give up after queueTimeoutMs
  {
    let active = 0;
    let peak = 0;
    const slow: Script = async () => {
      peak = Math.max(peak, ++active);
      await sleep(30);
      active--;
      return [ok('{"ok":true}')];
    };
    const { llm } = client(fakeSdk([slow]).sdkQuery, { maxConcurrency: 2 });
    const all = await Promise.all(Array.from({ length: 5 }, () => llm.completeJson({ ...ask, model: 'haiku', purpose: 'parser' })));
    assert.equal(all.length, 5);
    assert.equal(peak, 2, `peak ${peak}`);

    const q = client(fakeSdk([async () => (await sleep(150), [ok('{}')])]).sdkQuery, { maxConcurrency: 1, queueTimeoutMs: 20 });
    const first = q.llm.completeJson({ ...ask, model: 'haiku' });
    const t0 = Date.now();
    await assert.rejects(q.llm.completeJson({ ...ask, model: 'haiku' }), (e: unknown) => e instanceof LlmError && e.kind === 'timeout');
    assert.ok(Date.now() - t0 < 120, 'queue timeout fires before the slot frees');
    await first;
  }
  // 5. per-attempt timeout aborts the SDK call, retries once, then throws timeout
  {
    let aborted = 0;
    const hang: Script = (p) =>
      new Promise((_, reject) => {
        p.options?.abortController?.signal.addEventListener('abort', () => {
          aborted++;
          reject(new Error('AbortError'));
        });
      });
    const { sdkQuery, calls } = fakeSdk([hang]);
    const { llm, store } = client(sdkQuery, { timeoutMs: 30 });
    await assert.rejects(llm.completeJson({ ...ask, model: 'haiku', purpose: 'parser' }), (e: unknown) => e instanceof LlmError && e.kind === 'timeout');
    assert.equal(calls.length, 2);
    assert.equal(aborted, 2, 'the claude process is aborted on timeout');
    assert.deepEqual(store.llmCalls.map((c) => c.errorKind), ['timeout', 'timeout']);
  }
  // 6. rate_limit_event is kept for /health and warns at >= 80%; usage + cost are logged; effort + model policy reach the SDK
  {
    const { sdkQuery, calls } = fakeSdk([async () => [
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.98, resetsAt: 1795662000 } },
      ok('{"action":"accept"}', { usage: { input_tokens: 100, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0, output_tokens: 80 }, total_cost_usd: 0.0021 }),
    ]]);
    const { llm, store, warns } = client(sdkQuery);
    await llm.completeJson({ ...ask, model: 'sonnet', purpose: 'personal_agent' });
    assert.equal(calls[0].options?.model, 'haiku', 'personal_agent policy → haiku');
    assert.equal(calls[0].options?.effort, 'low');
    assert.ok(warns.some((w) => w.includes('seven_day') && w.includes('98%')));
    const rl = llm.status().rateLimits[0];
    assert.equal(rl.utilization, 0.98);
    assert.equal(rl.resetsAt, new Date(1795662000 * 1000).toISOString());
    assert.deepEqual(
      store.llmCalls.map((c) => [c.model, c.inputTokens, c.outputTokens, c.costUsd]),
      [['haiku', 1600, 80, 0.0021]],
      'LlmCall records the model actually used and its usage',
    );
  }
  // 7. policy + effort from env
  {
    const env = { LLM_MODEL_PERSONAL_AGENT: 'sonnet', LLM_MODEL_PARSER: 'opus', LLM_EFFORT: 'medium', LLM_EFFORT_BUSINESS_AGENT: 'high' };
    assert.equal(resolveModel('personal_agent', 'haiku', env), 'sonnet', 'env override wins');
    assert.equal(resolveModel('parser', 'sonnet', env), 'haiku', 'invalid override ignored, policy applies');
    assert.equal(resolveModel('something_new', 'sonnet', env), 'sonnet', 'unlisted purpose keeps the caller model');
    assert.equal(resolveModel(undefined, 'sonnet', env), 'sonnet');
    assert.equal(resolveEffort('business_agent', env), 'high');
    assert.equal(resolveEffort('parser', env), 'medium');
    assert.equal(resolveEffort('parser', {}), 'low');
    assert.equal(resolveEffort('parser', { LLM_EFFORT: 'turbo' }), 'low');
  }
  // 8. CLI branch: same typed errors, --effort passed, usage logged
  {
    const runs: CliRun[] = [
      { code: 1, stdout: JSON.stringify({ subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }), stderr: '', timedOut: false },
      { code: null, stdout: '', stderr: '', timedOut: true },
      { code: 0, stdout: JSON.stringify({ subtype: 'success', is_error: false, result: '{"x":2}', usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.0001 }), stderr: '', timedOut: false },
    ];
    const argsSeen: string[][] = [];
    const store = new MemoryStore(false);
    const llm = new LlmClient({
      store, mode: 'cli', maxConcurrency: 1,
      cliRunner: async (_cmd, args) => (argsSeen.push(args), runs.shift() ?? runs[0]),
    });
    await assert.rejects(llm.completeJson({ ...ask, model: 'haiku', purpose: 'parser' }), (e: unknown) => e instanceof LlmError && e.kind === 'auth');
    const { data } = await llm.completeJson<{ x: number }>({ ...ask, model: 'haiku', purpose: 'parser' }); // timeout → retry → ok
    assert.deepEqual(data, { x: 2 });
    assert.equal(argsSeen[0][argsSeen[0].indexOf('--effort') + 1], 'low');
    assert.deepEqual(store.llmCalls.map((c) => [c.ok, c.errorKind, c.costUsd]), [[false, 'auth', undefined], [false, 'timeout', undefined], [true, undefined, 0.0001]]);
  }
  // 9. a failing log store never changes the call outcome
  {
    const { sdkQuery } = fakeSdk([async () => [ok('{"a":1}')]]);
    const { llm, store, warns } = client(sdkQuery);
    store.saveLlmCall = async () => { throw new Error('no such column: errorKind'); };
    assert.deepEqual((await llm.completeJson({ ...ask, model: 'haiku' })).data, { a: 1 });
    assert.ok(warns.some((w) => w.includes('saveLlmCall failed')));
  }
  process.stdout.write('llm-client tests passed\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
