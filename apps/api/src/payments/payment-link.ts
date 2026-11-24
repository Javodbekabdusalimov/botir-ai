// Payment-link port. confirm → Order and business subscriptions call ONLY this. Incoming payments only.
// Bound in app.module.ts: TezCheck when TEZCHECK_API_KEY is set, else the TEST provider.
export type PaymentKind = 'order' | 'subscription';

export interface PayableOrder {
  id: string; // Order.id, or a `sub-…` reference for subscriptions (TezCheck external_reference)
  businessId: string;
  total: number; // so'm
  kind?: PaymentKind; // default 'order'
  title?: string;
}

export interface PaymentLink {
  payUrl: string;
  billId: string;
}

export interface PaymentLinkProvider {
  /** Must be idempotent per order (same order → same link). */
  createPaymentLink(order: PayableOrder): Promise<PaymentLink>;
}

export const PAYMENT_LINK = Symbol('PAYMENT_LINK');
