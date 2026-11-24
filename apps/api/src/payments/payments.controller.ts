import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

export class TezCheckWebhookDto {
  @IsString() @MaxLength(128) billId!: string;
  @IsString() @MaxLength(32) status!: string;
  @IsOptional() @IsInt() amount?: number;
}

interface RawBodyRequest extends Request {
  rawBody?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook/tezcheck')
  handle(
    @Body() body: TezCheckWebhookDto,
    @Headers('x-signature') signature: string | undefined,
    @Req() req: RawBodyRequest,
  ): Promise<{ applied: boolean }> {
    return this.payments.handleWebhook(body, signature, req.rawBody ?? JSON.stringify(body));
  }
}
