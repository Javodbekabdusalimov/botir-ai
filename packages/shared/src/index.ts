// Umumiy tiplar va API kontrakti (web + api). To'liq ro'yxat: docs/ARCHITECTURE.md
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type BusinessCategory = 'restaurant' | 'shop' | 'autoservice' | 'clinic';

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

// SSE: GET /negotiations/:id/stream
export type NegotiationEvent =
  | { type: 'message'; message: AgentMessage }
  | { type: 'offer'; offer: Offer }
  | { type: 'status'; status: NegotiationStatus };
