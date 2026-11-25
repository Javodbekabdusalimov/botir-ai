import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { OutreachDraftDto, OutreachPlanDto, OutreachSendDto } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ok } from '../common/http';
import { OutreachService } from './outreach.service';

/** Route names for the billing agent: every one of them is a PRO/MAX feature (gating lives in billing, not here). */
export const OUTREACH_ROUTES = ['POST /outreach/plan', 'POST /outreach/:optionId/draft', 'POST /outreach/:optionId/send', 'GET /outreach/threads'] as const;

/** The personal agent contacts businesses that are not Botir partners. Login required; no money flows here. */
@Controller('outreach')
@Auth()
export class OutreachController {
  constructor(@Inject(OutreachService) private readonly outreach: OutreachService) {}

  @Post('plan')
  async plan(@CurrentUser() user: DbUser, @Body() dto: Partial<OutreachPlanDto>) {
    return ok(await this.outreach.plan(user, { text: dto?.text, negotiationId: dto?.negotiationId, district: dto?.district }));
  }

  @Get('threads')
  async threads(@CurrentUser() user: DbUser) {
    return ok(await this.outreach.threads(user));
  }

  @Post(':optionId/draft')
  async draft(@Param('optionId') optionId: string, @Body() dto: Partial<OutreachDraftDto>) {
    return ok(await this.outreach.draft(optionId, { text: String(dto?.text ?? ''), district: dto?.district }));
  }

  @Post(':optionId/send')
  async send(@CurrentUser() user: DbUser, @Param('optionId') optionId: string, @Body() dto: Partial<OutreachSendDto>) {
    return ok(await this.outreach.send(user, optionId, String(dto?.text ?? '')));
  }
}
