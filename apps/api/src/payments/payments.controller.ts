import { Body, Controller, Get, Headers, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ok } from '../common/http';
import { PaymentsService, type TezcheckWebhookBody } from './payments.service';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@Controller()
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('payments/webhook/tezcheck')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-signature') sig: string | undefined, @Body() body: TezcheckWebhookBody) {
    return ok(await this.payments.handleWebhook(req.rawBody, sig, body));
  }

  /** TEST payment page (shown when TEZCHECK_API_KEY is not set). Clearly labeled, no real money. */
  @Get('pay/test/:orderId')
  async testPage(@Param('orderId') orderId: string, @Res() res: Response): Promise<void> {
    const p = await this.payments.findByOrder(orderId);
    const body = !p
      ? '<p>To‘lov topilmadi.</p>'
      : `<p>Buyurtma: <code>${esc(orderId)}</code></p><p>Summa: <b>${p.amount.toLocaleString('ru-RU')} so‘m</b></p>
         <p>Holat: <b>${esc(p.status)}</b></p>
         ${p.status === 'paid' ? '' : `<form method="post" action="/pay/test/${esc(orderId)}"><button>TEST to‘lov qilish</button></form>`}`;
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>TEST to'lov</title><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
      <h2>⚠️ TEST to‘lov sahifasi</h2><p>Bu haqiqiy to‘lov emas (TEZCHECK_API_KEY o‘rnatilmagan).</p>${body}</body>`);
  }

  @Post('pay/test/:orderId')
  async testPay(@Param('orderId') orderId: string, @Res() res: Response): Promise<void> {
    await this.payments.simulateTestPayment(orderId);
    res.redirect(303, `/pay/test/${orderId}`);
  }

  @Get('payments/order/:orderId')
  async byOrder(@Param('orderId') orderId: string) {
    return ok(await this.payments.findByOrder(orderId));
  }
}
