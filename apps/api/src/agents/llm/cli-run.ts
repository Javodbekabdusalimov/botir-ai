// `claude -p` subprocess runner + parsing of its JSON result, and token usage of a result (CLI and SDK alike).
import { spawn } from 'node:child_process';
import { classifyError, LlmError, looksLikeError } from './llm-error';

export interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
/** Seam for tests: spawns `claude -p` (real) or returns canned output. */
export type CliRunner = (cmd: string, args: string[], stdin: string, timeoutMs: number) => Promise<CliRun>;

export interface CallUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface AttemptResult {
  text: string;
  usage: CallUsage;
}

interface CliResult {
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  api_error_status?: number | null;
  usage?: UsageLike;
  total_cost_usd?: number;
}

/** `claude -p --output-format json` output → text, or the same typed LlmError as the SDK branch. */
export function parseCliRun(run: CliRun, timeoutMs: number): AttemptResult {
  if (run.timedOut) throw new LlmError('timeout', `claude -p: no answer in ${timeoutMs}ms`);
  let parsed: CliResult | undefined;
  try {
    parsed = JSON.parse(run.stdout) as CliResult;
  } catch {
    parsed = undefined;
  }
  if (!parsed || typeof parsed !== 'object') {
    const raw = `${run.stderr} ${run.stdout}`.trim().slice(0, 300);
    throw new LlmError(classifyError({ text: raw }), `claude -p exit ${run.code}: ${raw}`);
  }
  const text = typeof parsed.result === 'string' ? parsed.result : '';
  if (run.code !== 0 || parsed.is_error || typeof parsed.result !== 'string' || looksLikeError(text)) {
    const raw = text || run.stderr;
    throw new LlmError(classifyError({ text: raw, status: parsed.api_error_status }), `claude -p ${parsed.subtype ?? ''} exit ${run.code}: ${raw.slice(0, 300)}`);
  }
  return { text, usage: usageOf(parsed) };
}

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** inputTokens = fresh + cache read + cache write; outputTokens include thinking. */
export function usageOf(r: { usage?: UsageLike; total_cost_usd?: number }): CallUsage {
  const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const u = r.usage;
  return {
    ...(u ? { inputTokens: n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens), outputTokens: n(u.output_tokens) } : {}),
    ...(typeof r.total_cost_usd === 'number' ? { costUsd: r.total_cost_usd } : {}),
  };
}

export const runCli: CliRunner = (cmd, args, stdin, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });

