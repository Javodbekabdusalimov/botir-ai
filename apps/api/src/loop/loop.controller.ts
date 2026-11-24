import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { LoopProposal } from '@botir/shared';
import type { Proposal } from '../agents';
import { errMsg, ok } from '../common/http';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { AGENTS, type Agents } from '../negotiations/agents.provider';

const KIND: Record<Proposal['kind'], LoopProposal['kind']> = { prompt: 'prompt_fix', catalog: 'catalog_item', faq: 'faq' };

export const toLoopProposal = (p: Proposal): LoopProposal => ({
  id: p.id,
  businessId: p.businessId,
  kind: KIND[p.kind],
  title: p.change.length > 80 ? `${p.change.slice(0, 77)}...` : p.change,
  diff: p.change,
  reason: p.reason,
  evalBefore: Math.round((p.evalBefore ?? 0) * 100), // engine 0..1 → contract 0..100
  evalAfter: Math.round((p.evalAfter ?? 0) * 100),
  status: p.status,
  createdAt: p.createdAt,
});

/** Self-improvement loop: findings → proposals → golden-set eval → owner approve/reject (+ rollback). */
@Controller('loop')
export class LoopController {
  constructor(
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PrismaAgentStore) private readonly store: PrismaAgentStore,
  ) {}

  @Post('run')
  async run(@Body() body: { businessId?: string }) {
    if (!body?.businessId) throw new BadRequestException('businessId is required');
    const r = await this.agents.loopEngine.run(body.businessId);
    return ok({
      proposals: r.proposals.map(toLoopProposal),
      discarded: r.discarded.map(toLoopProposal),
      baseline: r.baseline ? { score: r.baseline.score, passed: r.baseline.passed, total: r.baseline.total } : null,
    });
  }

  @Get('proposals')
  async list(@Query('businessId') businessId: string) {
    if (!businessId) throw new BadRequestException('businessId is required');
    return ok((await this.store.getProposals(businessId)).map(toLoopProposal));
  }

  @Post('proposals/:id/approve')
  async approve(@Param('id') id: string) {
    const r = await this.guard(() => this.agents.loopEngine.approve(id));
    return ok({ ok: true as const, proposal: toLoopProposal(r.proposal), version: r.version ?? null });
  }

  @Post('proposals/:id/reject')
  async reject(@Param('id') id: string) {
    const p = await this.guard(() => this.agents.loopEngine.reject(id));
    return ok({ ok: true as const, proposal: toLoopProposal(p) });
  }

  @Post('rollback')
  async rollback(@Body() body: { businessId?: string }) {
    if (!body?.businessId) throw new BadRequestException('businessId is required');
    return ok({ active: (await this.agents.loopEngine.rollback(body.businessId)) ?? null });
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }
}
