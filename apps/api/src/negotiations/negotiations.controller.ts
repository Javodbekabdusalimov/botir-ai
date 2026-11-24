import { Body, Controller, Param, Post, Sse } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Observable, map } from 'rxjs';
import { NegotiationsService, type NegotiationEvent } from './negotiations.service';
import type { NegotiationTask } from './agents-bridge';

export class AgentRequestDto {
  @IsString() userId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  text!: string;
}

@Controller()
export class NegotiationsController {
  constructor(private readonly negotiations: NegotiationsService) {}

  @Post('agent/request')
  request(
    @Body() dto: AgentRequestDto,
  ): Promise<{ negotiationId: string; tasks: NegotiationTask[] }> {
    return this.negotiations.createRequest(dto.userId, dto.text);
  }

  /**
   * Server-sent events for the negotiation screen. The global response
   * interceptor does not touch SSE frames, so each frame is the raw
   * NegotiationEvent the web client expects.
   */
  @Sse('negotiations/:id/stream')
  stream(@Param('id') id: string): Observable<{ data: string }> {
    return this.negotiations
      .stream(id)
      .pipe(map((event: NegotiationEvent) => ({ data: JSON.stringify(event) })));
  }

  @Post('negotiations/:id/confirm')
  confirm(@Param('id') id: string): Promise<{ orderId: string; paymentLink: string }> {
    return this.negotiations.confirm(id);
  }
}
