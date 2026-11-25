import { Controller, ForbiddenException, Get, Inject, Param } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';

/** Public memory read is allowed only for the demo account (no login on the demo screen). */
const DEMO_USER_ID = 'demo-user';

/** "Botir sizni eslaydi": what the personal agent remembers about a user (soft-deleted facts hidden). */
@Controller()
export class MemoryController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get('me/memory')
  @Auth()
  async mine(@CurrentUser() user: DbUser) {
    return ok(await this.factsOf(user.id));
  }

  @Get('users/:id/memory')
  async ofUser(@Param('id') id: string) {
    if (id !== DEMO_USER_ID) throw new ForbiddenException('only the demo user memory is public; use GET /me/memory');
    return ok(await this.factsOf(id));
  }

  private async factsOf(userId: string) {
    const rows = await this.db.memoryFact.findMany({ where: { userId, deletedAt: null }, orderBy: { at: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, fact: r.fact, weight: r.weight, businessId: r.businessId, at: r.at.toISOString() }));
  }
}
