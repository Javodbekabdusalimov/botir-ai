import { Body, Controller, Get, Inject, MessageEvent, Param, Post, Sse } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AgentRequestDto } from '@botir/shared';
import { ok } from '../common/http';
import { NegotiationsService } from './negotiations.service';

@Controller()
export class NegotiationsController {
  constructor(@Inject(NegotiationsService) private readonly negotiations: NegotiationsService) {}

  @Post('agent/request')
  async request(@Body() dto: AgentRequestDto) {
    return ok(await this.negotiations.request(dto.userId, dto.text));
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
  async confirm(@Param('id') id: string, @Body() body: { businessId: string; acceptUpsell?: boolean }) {
    return ok(await this.negotiations.confirm(id, body?.businessId, body?.acceptUpsell === true));
  }
}
