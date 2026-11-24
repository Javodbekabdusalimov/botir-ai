import { Auditor } from './auditor';
import { BusinessAgent } from './business-agent';
import type { AgentLogger } from './logger';
import { LlmClient } from './llm/llm-client';
import { Memory } from './memory';
import { Negotiator } from './negotiator';
import { PersonalAgent } from './personal-agent';
import { PolicyGuard } from './policy-guard';
import type { AgentStore } from './store/agent-store';

export * from './types';
export * from './logger';
export * from './llm/llm-client';
export * from './embed/embed-client';
export * from './policy-guard';
export * from './business-agent';
export * from './personal-agent';
export * from './negotiator';
export * from './auditor';
export * from './memory';
export type { AgentStore } from './store/agent-store';
export { MemoryStore } from './store/memory-store';
export { DEMO_BUSINESSES, DEMO_PRODUCTS } from './store/seed';

/** Wires the whole agent layer around one store. Nest: call once in a factory provider. */
export function createAgents(opts: { store: AgentStore; logger?: AgentLogger; llmMode?: 'sdk' | 'cli' }) {
  const llm = new LlmClient({ store: opts.store, logger: opts.logger, mode: opts.llmMode });
  const guard = new PolicyGuard(opts.store);
  const businessAgent = new BusinessAgent(llm, guard);
  const personalAgent = new PersonalAgent(llm, opts.store);
  const negotiator = new Negotiator({ store: opts.store, businessAgent, personalAgent, logger: opts.logger });
  return {
    llm,
    guard,
    businessAgent,
    personalAgent,
    negotiator,
    auditor: new Auditor(llm, opts.store),
    memory: new Memory(llm, opts.store),
  };
}

export type Agents = ReturnType<typeof createAgents>;
