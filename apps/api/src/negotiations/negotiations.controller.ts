import { Body, Controller, ForbiddenException, Get, Headers, Inject, Ip, MessageEvent, Param, Post, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import type { AgentRequestDto, ApiResponse, ConfirmConflict, ConfirmDto, ConfirmResult } from '@botir/shared';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { OrderExistsError } from './confirm-rules';
import { NegotiationsService } from './negotiations.service';

@Controller()
export class NegotiationsController {
  constructor(
    @Inject(NegotiationsService) private readonly negotiations: NegotiationsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  @Post('agent/request')
  async request(@Body() dto: AgentRequestDto, @Ip() ip: string, @Headers('authorization') authorization?: string) {
    const district = typeof dto?.district === 'string' ? dto.district : undefined; // UI-chosen, sanitized in parse
    return ok(await this.negotiations.request(await this.requester(dto?.userId, authorization), dto?.text, ip, district));
  }

  /** Valid Bearer → its user id, otherwise null. */
  private async viewer(authorization: string | undefined): Promise<string | null> {
    const [scheme, token] = (authorization ?? '').split(' ');
    const user = scheme === 'Bearer' && token ? await this.auth.userFromToken(token) : null;
    return user?.id ?? null;
  }

  /**
   * Logged in (valid Bearer) → the token's user, body userId ignored.
   * Guest → the browser's random id. A Telegram id ("tg:*") or a registered user's id without their token → 403
   * (no impersonation, no reading someone else's memory).
   */
  private async requester(bodyUserId: string | undefined, authorization: string | undefined): Promise<string> {
    const viewer = await this.viewer(authorization);
    if (viewer) return viewer;
    const id = bodyUserId?.trim() || 'anonymous';
    const registered = id.startsWith('tg:') || (await this.db.user.findFirst({ where: { id }, select: { id: true } }));
    if (registered) throw new ForbiddenException("Bu foydalanuvchi nomidan so'rov yuborish uchun hisobingizga kiring");
    return id;
  }

  /** SSE: event name = NegotiationEvent.type, data = JSON.stringify(NegotiationEvent). Replays past events. */
  @Sse('negotiations/:id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.negotiations.stream(id).pipe(map((e) => ({ type: e.type, data: e })));
  }

  @Get('negotiations/:id')
  async get(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await this.negotiations.get(id, await this.viewer(authorization)));
  }

  /** 409 for an already confirmed offer carries the existing order: { ok:false, error, orderId, paymentLink? }. */
  @Post('negotiations/:id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body() body: ConfirmDto | undefined,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiResponse<ConfirmResult> | ({ ok: false; error: string } & ConfirmConflict)> {
    try {
      return ok(
        await this.negotiations.confirm(id, body?.businessId ?? '', {
          acceptUpsell: body?.acceptUpsell === true,
          taskId: typeof body?.taskId === 'string' && body.taskId ? body.taskId : undefined,
          viewerId: await this.viewer(authorization),
        }),
      );
    } catch (e) {
      if (!(e instanceof OrderExistsError)) throw e;
      res.status(409);
      return { ok: false, error: e.message, orderId: e.orderId, ...(e.paymentLink ? { paymentLink: e.paymentLink } : {}) };
    }
  }
}
