import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { LoopProposal } from '@botir/shared';
import type { Proposal } from '../agents';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { assertBusinessOwner } from '../auth/ownership';
import { errMsg, ok } from '../common/http';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
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
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  @Post('run')
  @Auth()
  async run(@Body() body: { businessId?: string }, @CurrentUser() user: DbUser) {
    if (!body?.businessId) throw new BadRequestException('businessId is required');
    await assertBusinessOwner(this.db, body.businessId, user);
    const r = await this.agents.loopEngine.run(body.businessId);
    return ok({
      proposals: r.proposals.map(toLoopProposal),
      discarded: r.discarded.map(toLoopProposal),
      baseline: r.baseline ? { score: r.baseline.score, passed: r.baseline.passed, total: r.baseline.total } : null,
    });
  }

  @Get('proposals')
  @Auth()
  async list(@Query('businessId') businessId: string, @CurrentUser() user: DbUser) {
    if (!businessId) throw new BadRequestException('businessId is required');
    await assertBusinessOwner(this.db, businessId, user);
    return ok((await this.store.getProposals(businessId)).map(toLoopProposal));
  }

  @Post('proposals/:id/approve')
  @Auth()
  async approve(@Param('id') id: string, @CurrentUser() user: DbUser) {
    await this.assertProposalOwner(id, user);
    const r = await this.guard(() => this.agents.loopEngine.approve(id));
    return ok({ ok: true as const, proposal: toLoopProposal(r.proposal), version: r.version ?? null });
  }

  @Post('proposals/:id/reject')
  @Auth()
  async reject(@Param('id') id: string, @CurrentUser() user: DbUser) {
    await this.assertProposalOwner(id, user);
    const p = await this.guard(() => this.agents.loopEngine.reject(id));
    return ok({ ok: true as const, proposal: toLoopProposal(p) });
  }

  @Post('rollback')
  @Auth()
  async rollback(@Body() body: { businessId?: string }, @CurrentUser() user: DbUser) {
    if (!body?.businessId) throw new BadRequestException('businessId is required');
    await assertBusinessOwner(this.db, body.businessId, user);
    return ok({ active: (await this.agents.loopEngine.rollback(body.businessId)) ?? null });
  }

  private async assertProposalOwner(id: string, user: DbUser): Promise<void> {
    const p = await this.store.getProposal(id);
    if (!p) throw new NotFoundException('proposal not found');
    await assertBusinessOwner(this.db, p.businessId, user);
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
