// Barcha kontrakt tiplari @botir/shared'dan (docs/ARCHITECTURE.md §6). Bu yerda faqat UI uchun yordamchi tiplar.
export type * from "@botir/shared";
import type { A2APayload, NegotiationMessage, NegotiationStatus } from "@botir/shared";

export type OfferPayload = Extract<A2APayload, { type: "OFFER" }>;

/** Bitta biznes bilan parallel muzokara chizig'i (lane) */
export interface Lane {
  businessId: string;
  messages: (NegotiationMessage & { shown: number })[];
  typing: NegotiationMessage["fromAgent"] | null;
  round: number;
}

export interface BestOffer {
  businessId: string;
  businessName: string;
  offer: OfferPayload;
}

export interface NegotiationState {
  lanes: Record<string, Lane>;
  order: string[];
  best: Record<string, BestOffer>;
  status: NegotiationStatus;
  error: string | null;
}

export interface CatalogRowInput {
  name: string;
  price: number;
  unit: string;
}

/* ---- Auth va to'lov holati (backend kontraktiga hali qo'shilmagan: faqat web uchun lokal tiplar) ---- */
export type UserRole = "business" | "user";
export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  businessId?: string;
}
export interface AuthResult {
  token: string;
  user: AuthUser;
}
export interface RegisterDto {
  name: string;
  phone: string;
  password: string;
  role: UserRole;
}
export type PaymentState = "pending" | "paid" | "failed" | "expired";
export interface PaymentStatus {
  status: PaymentState;
}
