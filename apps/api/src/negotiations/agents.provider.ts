import { Logger } from '@nestjs/common';
import { createAgents, type Agents } from '../agents';
import { PrismaAgentStore } from '../db/prisma-agent-store';

export const AGENTS = Symbol('AGENTS');
export type { Agents };

export const agentsProvider = {
  provide: AGENTS,
  inject: [PrismaAgentStore],
  useFactory: (store: PrismaAgentStore): Agents =>
    createAgents({ store, logger: new Logger('Agents'), llmMode: process.env.LLM_MODE === 'cli' ? 'cli' : 'sdk' }),
};
