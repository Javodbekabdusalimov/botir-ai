import { Controller, Get, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentSettlement } from './payment-settlement.service';
import { TestPaymentLinkProvider } from './test-payment.provider';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** TEST payment page behind the test link. Not a real payment. */
@Controller('pay/test')
export class TestPayController {
  constructor(
    @Inject(TestPaymentLinkProvider) private readonly payments: TestPaymentLinkProvider,
    @Inject(PaymentSettlement) private readonly settlement: PaymentSettlement,
  ) {}

  @Get(':orderId')
  async page(@Param('orderId') orderId: string, @Res() res: Response): Promise<void> {
    const p = await this.payments.findByOrder(orderId);
    const body = !p
      ? '<p>To‘lov topilmadi.</p>'
      : `<p>Buyurtma: <code>${esc(orderId)}</code></p><p>Summa: <b>${p.amount.toLocaleString('ru-RU')} so‘m</b></p>
         <p>Holat: <b>${esc(p.status)}</b></p>
         ${p.status === 'paid' ? '' : `<form method="post" action="/pay/test/${esc(orderId)}"><button>TEST to‘lov qilish</button></form>`}`;
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>TEST to'lov</title><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
      <h2>⚠️ TEST to‘lov sahifasi</h2><p>Bu haqiqiy to‘lov emas — TezCheck moduli ulanmagan.</p>${body}</body>`);
  }

  @Post(':orderId')
  async pay(@Param('orderId') orderId: string, @Res() res: Response): Promise<void> {
    const p = await this.payments.findByOrder(orderId);
    if (!p?.isTest) throw new NotFoundException('test payment not found'); // never touches real TezCheck payments
    await this.settlement.markPaid(p);
    res.redirect(303, `/pay/test/${orderId}`);
  }
}
