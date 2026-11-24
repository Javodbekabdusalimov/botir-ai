// Agent-layer internal contract (pre-PR#1 shapes). The public web contract lives in @botir/shared;
// apps/api/src/negotiations maps these internal events to the shared NegotiationEvent.
import type { BusinessCategory as SharedCategory } from '../../../../packages/shared/src/index';

export type BusinessCategory = SharedCategory;

export interface Business {
  id: string;
  name: string;
  category: BusinessCategory;
  area: string;
  maxDiscountPct: number;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  price: number; // so'm
  unit: string;
}

export type AgentRole = 'user' | 'biz_agent' | 'personal_agent' | 'system';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  text: string;
  at: string; // ISO
}

export type NegotiationStatus = 'running' | 'agreed' | 'rejected' | 'timeout';

export interface Offer {
  id: string;
  sessionId: string;
  items: { productId: string; qty: number }[];
  total: number;
  discountPct: number;
  status: 'proposed' | 'accepted' | 'declined';
}

export type NegotiationEvent =
  | { type: 'message'; message: AgentMessage }
  | { type: 'offer'; offer: Offer }
  | { type: 'status'; status: NegotiationStatus };
