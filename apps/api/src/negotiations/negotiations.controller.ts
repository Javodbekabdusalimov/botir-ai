import { Body, Controller, Get, Headers, Inject, MessageEvent, Param, Post, Sse, UnauthorizedException } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AgentRequestDto } from '@botir/shared';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { NegotiationsService } from './negotiations.service';

@Controller()
export class NegotiationsController {
  constructor(
    @Inject(NegotiationsService) private readonly negotiations: NegotiationsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  @Post('agent/request')
  async request(@Body() dto: AgentRequestDto, @Headers('authorization') authorization?: string) {
    return ok(await this.negotiations.request(await this.requester(dto?.userId, authorization), dto?.text));
  }

  /**
   * Logged in (valid Bearer) → the token's user, body userId ignored.
   * Guest → the browser's random id; a registered user's id without their token is refused (no impersonation / memory leak).
   */
  private async requester(bodyUserId: string | undefined, authorization: string | undefined): Promise<string> {
    const [scheme, token] = (authorization ?? '').split(' ');
    const user = scheme === 'Bearer' && token ? await this.auth.userFromToken(token) : null;
    if (user) return user.id;
    const id = bodyUserId?.trim() || 'anonymous';
    const registered = await this.db.user.findFirst({ where: { id }, select: { id: true } });
    if (registered) throw new UnauthorizedException('Bu foydalanuvchi nomidan so‘rov uchun kirish kerak');
    return id;
  }

  /** SSE: event name = NegotiationEvent.type, data = JSON.stringify(NegotiationEvent). Replays past events. */
  @Sse('negotiations/:id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.negotiations.stream(id).pipe(map((e) => ({ type: e.type, data: e })));
  }

  @Get('negotiations/:id')
  async get(@Param('id') id: string) {
    return ok(await this.negotiations.get(id));
  }

  @Post('negotiations/:id/confirm')
  async confirm(@Param('id') id: string, @Body() body: { businessId: string }) {
    return ok(await this.negotiations.confirm(id, body?.businessId));
  }
}
