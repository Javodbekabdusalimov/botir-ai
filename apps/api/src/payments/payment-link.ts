// Payment-link port. confirm → Order calls ONLY this. The real TezCheck module (Ibrat, branch api/tezcheck)
// replaces the implementation by binding PAYMENT_LINK to its own class in app.module.ts. Incoming payments only.
export interface PayableOrder {
  id: string;
  businessId: string;
  total: number; // so'm
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
