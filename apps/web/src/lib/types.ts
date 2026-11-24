// Umumiy tiplar @botir/shared'dan; kontraktda yo'q javob shakllari shu yerda (api bilan kelishilgach shared'ga ko'chadi).
import type { Business, Offer, NegotiationStatus } from "@botir/shared";

export type {
  ApiResponse,
  Business,
  BusinessCategory,
  Product,
  AgentRole,
  AgentMessage,
  NegotiationStatus,
  Offer,
  NegotiationEvent,
} from "@botir/shared";

export interface BusinessInput {
  name: string;
  category: Business["category"];
  area: string;
  hours: string;
  maxDiscountPct: number;
}

export interface NegotiationSession {
  id: string;
  businessId: string;
  businessName?: string;
  request: string;
  status: NegotiationStatus;
  round: number;
  createdAt: string;
}

export interface AssistantTask {
  id: string;
  title: string;
  category: Business["category"];
  area?: string;
  when?: string;
  people?: number;
  businessId: string;
  businessName: string;
  request: string;
}

export type OrderStatus = "new" | "confirmed" | "paid" | "done" | "cancelled";

export interface Order {
  id: string;
  businessId: string;
  customer: string;
  summary: string;
  total: number;
  status: OrderStatus;
  slotAt?: string;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  channel: "telegram" | "web";
  customer: string;
  lastMessage: string;
  at: string;
}

export interface Analytics {
  topAsked: { text: string; count: number }[];
  missing: { text: string; count: number }[];
  lostClients: { name: string; reason: string; at: string }[];
}

export type AcceptResult = { order: Order; payUrl: string; offer?: Offer };
export type ChatReply = { reply: string };

/* Telegram ulash, inbox, yaxshilash (kontraktda hali yo'q: api bilan kelishiladi) */
export type TgMode = "copilot" | "command" | "autopilot";
export type TgStartResult = { requestId: string };
export type TgVerifyResult = { status: "ok" | "need_2fa" };

export interface InboxItem {
  id: string;
  customer: string;
  channel: "telegram" | "web";
  at: string;
  lastMessage: string;
  draft: string;
  mode: TgMode;
  status: "draft" | "sent" | "needs_human";
}

export interface MemoryFact {
  id: string;
  text: string;
  source: string;
  at: string;
}

export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  status: "proposed" | "approved" | "rejected";
}

export interface ImproveData {
  suggestions: Suggestion[];
  facts: MemoryFact[];
}
