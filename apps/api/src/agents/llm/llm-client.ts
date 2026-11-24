import { spawn } from 'node:child_process';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentStore } from '../store/agent-store';
import type { AgentLogger } from '../logger';
import { silentLogger } from '../logger';
import type { LlmModel } from '../types';

export interface CompleteInput {
  system: string;
  prompt: string;
  model: LlmModel;
  json?: boolean;
  purpose?: string; // for LlmCall log ("business_agent", "parser", ...)
}

export interface CompleteOutput {
  text: string;
  ms: number;
}

export interface LlmClientOptions {
  store: AgentStore;
  logger?: AgentLogger;
  /** 'sdk' = @anthropic-ai/claude-agent-sdk query(); 'cli' = `claude -p` subprocess. */
  mode?: 'sdk' | 'cli';
  claudePath?: string;
  timeoutMs?: number;
}

const JSON_HINT =
  '\n\nJavobni FAQAT bitta JSON obyekt sifatida qaytar. Markdown, ``` yoki izoh yozma.';

/**
 * Pure completion over the owner's Claude Max login (no API key).
 * No tools, 1 turn, no filesystem settings/hooks. Every call is logged to store.saveLlmCall.
 */
export class LlmClient {
  private readonly store: AgentStore;
  private readonly logger: AgentLogger;
  private readonly mode: 'sdk' | 'cli';
  private readonly claudePath: string;
  private readonly timeoutMs: number;

  constructor(opts: LlmClientOptions) {
    this.store = opts.store;
    this.logger = opts.logger ?? silentLogger;
    this.mode = opts.mode ?? 'sdk';
    this.claudePath = opts.claudePath ?? process.env.CLAUDE_PATH ?? 'claude';
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 180_000);
  }

  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const system = input.json ? input.system + JSON_HINT : input.system;
    const started = Date.now();
    let text = '';
    let ok = false;
    try {
      text = this.mode === 'sdk' ? await this.viaSdk(system, input) : await this.viaCli(system, input);
      ok = true;
      return { text, ms: Date.now() - started };
    } finally {
      const ms = Date.now() - started;
      this.logger.log(`[llm] ${input.model} ${input.purpose ?? '-'} ${ms}ms ok=${ok}`);
      await this.store.saveLlmCall({
        model: input.model,
        ms,
        chars: system.length + input.prompt.length + text.length,
        purpose: input.purpose ?? 'unknown',
        ok,
        at: new Date().toISOString(),
      });
    }
  }

  /** complete() + parse JSON (tolerates ```json fences / leading prose). */
  async completeJson<T>(input: Omit<CompleteInput, 'json'>): Promise<{ data: T; ms: number }> {
    const { text, ms } = await this.complete({ ...input, json: true });
    return { data: parseJsonLoose<T>(text), ms };
  }

  private async viaSdk(system: string, input: CompleteInput): Promise<string> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const q = query({
        prompt: input.prompt,
        options: {
          model: input.model,
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
        if (msg.type === 'result') {
          if (msg.subtype === 'success') return msg.result;
          throw new Error(`LLM result ${msg.subtype}`);
        }
      }
      throw new Error('LLM: no result message');
    } finally {
      clearTimeout(timer);
    }
  }

  private viaCli(system: string, input: CompleteInput): Promise<string> {
    const args = [
      '-p',
      '--model', input.model,
      '--output-format', 'json',
      '--max-turns', '1',
      '--tools', '',
      '--setting-sources', '',
      '--no-session-persistence',
      '--system-prompt', system,
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(this.claudePath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), this.timeoutMs);
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => (err += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`claude -p exit ${code}: ${err.slice(0, 300)}`));
        try {
          const parsed = JSON.parse(out) as { result?: string; is_error?: boolean };
          if (parsed.is_error || typeof parsed.result !== 'string') {
            return reject(new Error(`claude -p error: ${out.slice(0, 300)}`));
          }
          resolve(parsed.result);
        } catch {
          reject(new Error(`claude -p bad json: ${out.slice(0, 300)}`));
        }
      });
      child.stdin.end(input.prompt);
    });
  }
}

export function parseJsonLoose<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`LLM returned no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}
