// Botir AI — umumiy tiplar va API kontrakti (apps/web ↔ apps/api).
// Manba: docs/ARCHITECTURE.md §3.3, §5, §6. O'zgartirishdan oldin Ibrat + Javod kelishadi.

// ---------- Umumiy ----------
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };
export type UUID = string;
export type ISODate = string;
export type Lang = 'uz' | 'ru';

interface Base {
  id: UUID;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Auth (telefon + parol, JWT Bearer) ----------
export type UserRole = 'business' | 'user';

export interface AuthUser {
  id: UUID;
  name: string;
  phone: string; // +998XXXXXXXXX
  role: UserRole;
  businessId?: UUID;
}

export interface RegisterDto {
  name: string;
  phone: string;
  password: string;
  role: UserRole;
}
export interface LoginDto {
  phone: string;
  password: string;
}
/** POST /auth/register, POST /auth/login */
export interface AuthResponse {
  token: string; // Authorization: Bearer <token>
  user: AuthUser;
}
/** GET /auth/me */
export interface MeResponse {
  user: AuthUser;
  businessId?: UUID;
}

// ---------- Biznes va katalog ----------
export type BusinessCategory = 'restaurant' | 'shop' | 'autoservice' | 'clinic' | 'beauty' | 'other';

/** { mon: ["09:00","21:00"], ... } — yopiq kun: null */
export type WorkHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string] | null>;

export interface Business extends Base {
  name: string;
  category: BusinessCategory;
  address: string;
  district: string;
  geo?: { lat: number; lng: number };
  workHours: WorkHours;
  maxDiscountPct: number; // default 0
  lang: Lang;
  ownerUserId: UUID;
  isDemo: boolean;
}

export type CreateBusinessDto = Pick<Business, 'name' | 'category' | 'address' | 'district' | 'workHours' | 'maxDiscountPct' | 'lang'> &
  Partial<Pick<Business, 'geo'>>;

export interface CatalogItem extends Base {
  businessId: UUID;
  name: string;
  description?: string;
  price: number; // so'm
  unit: string; // dona, porsiya, xizmat...
  durationMin?: number; // xizmatlar uchun
  inStock: boolean;
  tags: string[];
}

export type CatalogItemDto = Omit<CatalogItem, keyof Base | 'businessId'>;
export interface CatalogImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ---------- Buyurtma, bron, to'lov ----------
export type OrderStatus = 'draft' | 'pending_confirm' | 'confirmed' | 'paid' | 'cancelled';

export interface OrderItem {
  catalogItemId: UUID;
  name: string;
  qty: number;
  price: number;
}

export interface Order extends Base {
  businessId: UUID;
  userId: UUID;
  items: OrderItem[];
  total: number;
  discountPct: number;
  status: OrderStatus;
}

export type BookingStatus = 'pending_confirm' | 'confirmed' | 'cancelled';
export interface Booking extends Base {
  businessId: UUID;
  userId: UUID;
  start: ISODate;
  end: ISODate;
  people?: number;
  status: BookingStatus;
}

/** Faqat KIRIM. Refund/payout/withdraw tiplari ataylab yo'q. */
export interface Payment extends Base {
  orderId: UUID;
  provider: 'tezcheck';
  billId: string;
  link: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired';
}

export interface Analytics {
  topRequests: { query: string; count: number }[];
  notFound: { query: string; count: number }[];
  lostCustomers: { userId: UUID; name: string; lastOrderAt: ISODate }[];
  revenue: { today: number; week: number; month: number };
}

// ---------- A2A muzokara (§3.3) ----------
export type AgentKind = 'personal' | 'business';

export interface NegotiationTask {
  taskId: string;
  category: BusinessCategory;
  need: string;
  when?: ISODate;
  where?: string;
  people?: number;
  budget?: number;
}

export type A2APayload =
  | { type: 'REQUEST'; taskId: string; need: string; when?: ISODate; people?: number; budget?: number }
  | {
      type: 'OFFER';
      items: OrderItem[];
      price: number;
      discountPct: number;
      validUntil: ISODate;
      slot?: { start: ISODate; end: ISODate };
    }
  | { type: 'COUNTER'; askDiscountPct: number; reason: string }
  | { type: 'ACCEPT' }
  | { type: 'REJECT'; reason: string };

export type A2AType = A2APayload['type'];

export interface NegotiationMessage {
  id: UUID;
  negotiationId: UUID;
  fromAgent: AgentKind;
  businessId: UUID;
  round: number; // 1..3
  text: string; // odam o'qiydigan matn (UI uchun)
  payload: A2APayload;
  createdAt: ISODate;
}

export type NegotiationStatus = 'running' | 'agreed' | 'rejected' | 'confirmed' | 'failed';

export interface Negotiation extends Base {
  userId: UUID;
  tasks: NegotiationTask[];
  status: NegotiationStatus;
}

/** GET /negotiations/:id/stream — SSE event.data = JSON.stringify(NegotiationEvent) */
export type NegotiationEvent =
  | { type: 'message'; message: NegotiationMessage }
  | { type: 'best_offer'; businessId: UUID; businessName: string; offer: Extract<A2APayload, { type: 'OFFER' }> }
  | { type: 'status'; status: NegotiationStatus }
  | { type: 'error'; error: string };

export interface AgentRequestDto {
  userId: UUID;
  text: string;
}
export interface AgentRequestResult {
  negotiationId: UUID;
  tasks: NegotiationTask[];
}
export interface ConfirmResult {
  orderId: UUID;
  paymentLink: string;
}

// ---------- Telegram Connect + Inbox (§4) ----------
export type ChatMode = 'copilot' | 'command' | 'autopilot' | 'off';

export interface TgConnectStartDto {
  businessId: UUID;
  phone: string;
}
export interface TgConnectStartResult {
  loginId: string;
}
export interface TgConnectCodeDto {
  loginId: string;
  code: string;
  password?: string; // 2FA
}
export interface TgConnectCodeResult {
  status: 'connected' | 'need_password' | 'invalid_code' | 'failed';
}

export interface Chat {
  id: UUID;
  tgAccountId: UUID;
  peerId: string;
  title: string;
  mode: ChatMode;
  lastMessageAt: ISODate;
  lastMessageText?: string;
  needsHuman: boolean;
  unread?: number;
}

export interface InboxMessage {
  id: UUID;
  chatId: UUID;
  direction: 'in' | 'out';
  author: 'customer' | 'owner' | 'ai';
  text: string;
  voiceUrl?: string;
  transcript?: string;
  sentAt: ISODate;
  /** copilot rejimida AI tayyorlagan, hali yuborilmagan qoralama */
  isDraft?: boolean;
}

export interface SendMessageDto {
  text: string;
}
export interface SetModeDto {
  mode: ChatMode;
}

// ---------- Shaxsiy Telegram (B2C, /me/*, Bearer token) ----------
/** POST /me/tg-connect/start; keyin POST /me/tg-connect/code — TgConnectCodeDto */
export interface MeTgConnectStartDto {
  phone: string;
}
/** GET /me/tg-connect */
export interface MeTgStatus {
  /** false = serverda TG_API_ID/TG_API_HASH yo'q (start/code → 503) */
  available: boolean;
  connected: boolean;
  username?: string;
  connectedAt?: ISODate;
}
export type UserActionStatus = 'pending' | 'sending' | 'sent' | 'rejected' | 'failed';
/** GET /me/actions — AI foydalanuvchi Telegramidan yubormoqchi bo'lgan xabar; faqat approve'dan keyin yuboriladi */
export interface UserAction {
  id: UUID;
  chatId: string;
  peerTitle: string;
  text: string;
  status: UserActionStatus;
  reason?: string;
  createdAt: ISODate;
}

// ---------- Loop / o'z-o'zini yaxshilash (§3.6) ----------
export type ProposalKind = 'prompt_fix' | 'catalog_item' | 'faq';

export interface LoopProposal {
  id: UUID;
  businessId: UUID;
  kind: ProposalKind;
  title: string;
  diff: string; // nima o'zgaradi
  reason: string; // qaysi audit topilmasidan
  evalBefore: number; // oltin to'plam bali 0..100
  evalAfter: number;
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back';
  createdAt: ISODate;
}

export interface MemoryFact {
  id: UUID;
  subjectType: 'customer' | 'user' | 'business';
  subjectId: UUID;
  fact: string;
  source: string;
  confidence: number; // 0..1
  createdAt: ISODate;
}

// ---------- Endpointlar ro'yxati (§6) ----------
export const API = {
  authTelegram: 'POST /auth/telegram',
  authRegister: 'POST /auth/register',
  authLogin: 'POST /auth/login',
  authMe: 'GET /auth/me',
  businesses: 'GET /businesses',
  createBusiness: 'POST /businesses',
  catalogImport: 'POST /businesses/:id/catalog/import',
  catalog: 'GET|POST|PATCH /businesses/:id/catalog',
  orders: 'GET /businesses/:id/orders',
  analytics: 'GET /businesses/:id/analytics',
  tgStart: 'POST /tg-connect/start',
  tgCode: 'POST /tg-connect/code',
  inbox: 'GET /inbox',
  inboxMessages: 'GET /inbox/:chatId/messages',
  inboxSend: 'POST /inbox/:chatId/send',
  inboxMode: 'PATCH /inbox/:chatId/mode',
  agentRequest: 'POST /agent/request',
  negotiationStream: 'GET /negotiations/:id/stream',
  negotiationConfirm: 'POST /negotiations/:id/confirm',
  tezcheckWebhook: 'POST /payments/webhook/tezcheck',
  loopRun: 'POST /loop/run',
  loopApprove: 'POST /loop/proposals/:id/approve',
  loopReject: 'POST /loop/proposals/:id/reject',
} as const;
