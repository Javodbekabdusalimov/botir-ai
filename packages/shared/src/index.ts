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
  /** Owner's business subscription state (business role only). */
  business?: Pick<Business, 'id' | 'name' | 'plan' | 'planUntil' | 'aiCredits'>;
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
  plan?: PlanId; // default 'start'
  planUntil?: ISODate | null; // pro active until
  aiCredits?: number; // AI dialog quota left
}

// ---------- Obuna (Botir daromadi: oylik obuna, TezCheck orqali, faqat KIRIM) ----------
export type PlanId = 'start' | 'pro';
/** GET /plans */
export interface Plan {
  id: PlanId;
  name: string;
  price: number; // so'm / oy
  aiCredits: number; // oylik AI dialog kvotasi
  periodDays: number;
}
/** POST /businesses/:id/subscription {plan:'pro'} (owner, Bearer) */
export interface SubscribeDto {
  plan: 'pro';
}
export interface SubscriptionResult {
  paymentRef: string; // GET /payments/:paymentRef/status
  payUrl: string;
  amount: number;
}
/** GET /payments/:orderId/status (orderId yoki obuna paymentRef). Holat polling orqali yangilanadi. */
export interface PaymentStatusResult {
  orderId: string;
  kind: 'order' | 'subscription';
  status: Payment['status'];
  amount: number;
  payUrl: string;
  paidAt?: ISODate;
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
  | {
      type: 'REQUEST';
      taskId: string;
      need: string;
      when?: ISODate;
      people?: number;
      budget?: number;
      /** "Botir sizni eslaydi": remembered user preferences injected into this request. */
      appliedMemory?: string[];
    }
  | {
      type: 'OFFER';
      items: OrderItem[];
      price: number;
      discountPct: number;
      validUntil: ISODate;
      slot?: { start: ISODate; end: ISODate };
      /** One complementary catalog item suggestion. NOT included in `price`; user accepts via confirm `acceptUpsell`. */
      upsell?: UpsellSuggestion;
    }
  | { type: 'COUNTER'; askDiscountPct: number; reason: string }
  | { type: 'ACCEPT' }
  | { type: 'REJECT'; reason: string };

export type A2AType = A2APayload['type'];

export interface UpsellSuggestion {
  itemId: UUID;
  name: string;
  price: number; // catalog price, computed by code
}

/** One competitor in a task's competition (sorted best first): lowest price, then higher discount. */
export interface CompetitionEntry {
  businessId: UUID;
  businessName: string;
  price: number;
  discountPct: number;
}

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
  | {
      type: 'best_offer';
      businessId: UUID;
      businessName: string;
      offer: Extract<A2APayload, { type: 'OFFER' }>;
      /** true = winner of the task's competition (emitted after all lanes of the task finished). */
      winner?: boolean;
      ranking?: CompetitionEntry[];
      reason?: string; // e.g. "3 ta joy raqobatlashdi → eng arzon"
      appliedMemory?: string[];
    }
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
  total?: number; // order total computed from the catalog (includes upsell if accepted)
  upsellAccepted?: boolean;
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
  paymentStatus: 'GET /payments/:orderId/status',
  plans: 'GET /plans',
  subscribe: 'POST /businesses/:id/subscription',
  loopRun: 'POST /loop/run',
  loopApprove: 'POST /loop/proposals/:id/approve',
  loopReject: 'POST /loop/proposals/:id/reject',
} as const;

// ---------- Biznes bilimi (B2B onboarding: manbalar → qoralama faktlar → egasi tasdiqlaydi → agent konteksti) ----------
export type KnowledgeSourceKind = 'photo' | 'pdf' | 'text' | 'telegram' | 'website' | 'voice' | 'sync' | 'question';
export type KnowledgeFactKind = 'profile' | 'policy' | 'faq' | 'catalog' | 'style';
export type KnowledgeFactStatus = 'draft' | 'confirmed' | 'rejected';

export interface KnowledgeSource {
  id: UUID;
  kind: KnowledgeSourceKind;
  label: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  factsCount: number;
  createdAt: ISODate;
}
export interface KnowledgeFact {
  id: UUID;
  sourceId: UUID;
  sourceKind: KnowledgeSourceKind;
  kind: KnowledgeFactKind;
  topic: string;
  question?: string;
  content: string;
  price?: number; // catalog, so'm
  unit?: string; // catalog
  evidence?: string;
  confidence: number; // 0..1
  status: KnowledgeFactStatus;
  createdAt: ISODate;
}
/** Agent bilmagan savol — egasi bir marta javob beradi, javob FAQ bo'ladi. */
export interface PendingQuestion {
  id: UUID;
  question: string;
  timesAsked: number;
  status: 'open' | 'answered' | 'dismissed';
  answer?: string;
  createdAt: ISODate;
}
export interface KnowledgeMetrics {
  /** AgentTurn bo'yicha: answered / total, 0..100. Hali suhbat yo'q → null (0 emas!). */
  aiAnsweredPct: number | null;
  aiTurns: number;
  /** Biznes yaratilganidan agent tayyor bo'lguncha, daqiqa. Hali tayyor emas → null. */
  minutesToReady: number | null;
  /** Qaysi mavzular hali yo'q (profile, catalog, delivery, payment, booking, ...). */
  missingTopics: string[];
}
/** GET /businesses/:id/knowledge (egasi) */
export interface KnowledgeOverview {
  sources: KnowledgeSource[];
  facts: KnowledgeFact[];
  questions: PendingQuestion[];
  metrics: KnowledgeMetrics;
}
/** POST /businesses/:id/knowledge/sources/text — kind 'voice' = brauzer diktovkasi (uz-UZ) matni */
export interface KnowledgeTextDto {
  text: string;
  kind?: 'text' | 'voice';
}
/** POST /businesses/:id/knowledge/sources/url */
export interface KnowledgeUrlDto {
  url: string;
}
/** POST /businesses/:id/knowledge/sources/telegram — FAQAT egasi tanlagan chatlar (shaxsiy chatlar yuborilmaydi) */
export interface KnowledgeTelegramDto {
  chatIds: UUID[];
}
// POST /businesses/:id/knowledge/sources/file — multipart "file": rasm (jpg/png/webp), PDF, audio. → KnowledgeSource (processing)
/** PATCH /businesses/:id/knowledge/facts/:factId */
export type KnowledgeFactPatch = Partial<Pick<KnowledgeFact, 'topic' | 'question' | 'content' | 'price' | 'unit' | 'status'>>;
/** POST /businesses/:id/knowledge/facts/confirm — ko'pini birdan */
export interface KnowledgeConfirmDto {
  ids: UUID[];
}
/** POST /businesses/:id/knowledge/questions/:qid/answer */
export interface KnowledgeAnswerDto {
  answer: string;
}
/** POST /businesses/:id/sync-key → kalit FAQAT bir marta ko'rinadi */
export interface SyncKeyResult {
  key: string;
}
/** POST /sync/catalog (X-Sync-Key): iiko/1C/POS/skript narx va qoldiqni yuboradi */
export interface SyncCatalogDto {
  items: { name: string; price: number; unit?: string; inStock?: boolean }[];
}
export interface SyncCatalogResult {
  updated: number;
  created: number;
  errors: string[];
}
