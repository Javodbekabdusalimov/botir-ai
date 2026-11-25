import type { LlmModel } from '../types';

/** Agent SDK `effort` / CLI `--effort` levels. */
export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const MODELS: readonly string[] = ['sonnet', 'haiku'];

const isModel = (v: string | undefined): v is LlmModel => v !== undefined && MODELS.includes(v);
const isEffort = (v: string | undefined): v is LlmEffort => v !== undefined && EFFORTS.includes(v);

/** Cost policy: model per purpose. A purpose not listed keeps the model the caller passed. */
export const MODEL_POLICY: ReadonlyMap<string, LlmModel> = new Map<string, LlmModel>([
  ['business_agent', 'sonnet'],
  ['knowledge_extract', 'sonnet'],
  ['personal_agent', 'haiku'], // its decisions are bounded by a deterministic budget/items guard
  ['parser', 'haiku'],
  ['memory', 'haiku'],
  ['auditor', 'haiku'],
  ['eval_judge', 'haiku'],
  ['loop_proposer', 'haiku'],
]);

/** Fallback after a failed retry. Never a more expensive model. */
export const FALLBACK_MODEL: Readonly<Partial<Record<LlmModel, LlmModel>>> = { sonnet: 'haiku' };

/** "business_agent" → "LLM_MODEL_BUSINESS_AGENT". */
const envKey = (prefix: string, purpose: string): string => `${prefix}_${purpose.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

/** LLM_MODEL_<PURPOSE> > MODEL_POLICY[purpose] > the caller's model. */
export function resolveModel(purpose: string | undefined, requested: LlmModel, env: NodeJS.ProcessEnv = process.env): LlmModel {
  if (!purpose) return requested;
  const override = env[envKey('LLM_MODEL', purpose)];
  if (isModel(override)) return override;
  return MODEL_POLICY.get(purpose) ?? requested;
}

/** LLM_EFFORT_<PURPOSE> > LLM_EFFORT > 'low'. Unknown values fall back to 'low'. */
export function resolveEffort(purpose: string | undefined, env: NodeJS.ProcessEnv = process.env): LlmEffort {
  const perPurpose = purpose ? env[envKey('LLM_EFFORT', purpose)] : undefined;
  if (isEffort(perPurpose)) return perPurpose;
  const global = env.LLM_EFFORT;
  return isEffort(global) ? global : 'low';
}

/** Positive integer from env, else the default (a 0 / garbage limit must never deadlock the queue). */
export function envInt(name: string, def: number, env: NodeJS.ProcessEnv = process.env): number {
  const n = Math.floor(Number(env[name]));
  return Number.isFinite(n) && n > 0 ? n : def;
}
