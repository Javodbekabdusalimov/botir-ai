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
