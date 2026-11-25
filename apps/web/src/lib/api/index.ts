/**
 * Backend bilan aloqa: docs/ARCHITECTURE.md §6.
 *
 * Har funksiya `request(path, init, fallback)` orqali ishlaydi. `fallback` (mock) FAQAT majburiy demo
 * (`NEXT_PUBLIC_DEMO=1` yoki API manzili yo'q) da ishlaydi; server xatosi foydalanuvchiga xato bo'lib ko'rinadi.
 * Pul, kirish, Telegram, loop va bilim yozuvlari demoda ham soxtalashtirilmaydi (`demoUnavailable`).
 * Past darajali qismlar: `config` (rejim), `http` (request, xatolar, token), `stream` (SSE),
 * `negotiation-memory` (sessionStorage). Bu fayl faqat endpointlarni e'lon qiladi.
 */
import type {
  AgentRequestResult, Analytics, AuthResult, Business, CatalogImportResult, CatalogRowInput, Chat, ChatMode,
  ConfirmResult, CreateBusinessDto, InboxMessage, KnowledgeFact, KnowledgeFactPatch, KnowledgeOverview, KnowledgeSource, LoopProposal, MeResponse, MeTgStatus, MemoryFact, Order,
  PaymentStatus, PendingQuestion, Plan as BillingPlan, RegisterDto, SyncKeyResult, SubscriptionResult, TgConnectCodeResult, TgConnectStartResult, UserAction,
} from "../types";
import * as mock from "../mock";
import { AGENT_TIMEOUT_MS, LOOP_TIMEOUT_MS, TIMEOUT_MS } from "./config";
import { delay, demoUnavailable, json, request } from "./http";
import { rememberRequest } from "./negotiation-memory";

export { modeStore } from "./config";
export { ApiError, NotFoundError, UnauthorizedError, SERVER_DOWN, TOKEN_KEY, getToken, setToken } from "./http";
export { slowStore } from "./config";
export { recallRequestText } from "./negotiation-memory";
export { streamNegotiation } from "./stream";

/* ---- Foydalanuvchi ---- */
export function getUserId(): string {
  try {
    let id = localStorage.getItem("botir.userId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("botir.userId", id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/* ---- Biznes va katalog ---- */
export const getBusinesses = () => request<Business[]>("/businesses", undefined, () => mock.mockBusinesses());

export const createBusiness = (dto: CreateBusinessDto) =>
  request<Business>("/businesses", json("POST", dto), demoUnavailable);

/** Kontrakt: fayl yuboriladi (server o'zi o'qiydi). Fayl bo'lmasa (namuna katalog) qatorlar JSON bilan ketadi. */
export function importCatalog(businessId: string, file: File | null, rows: CatalogRowInput[]) {
  const init: RequestInit = file
    ? (() => {
        const fd = new FormData();
        fd.append("file", file);
        return { method: "POST", body: fd };
      })()
    : json("POST", { rows });
  return request<CatalogImportResult>(`/businesses/${businessId}/catalog/import`, init, demoUnavailable);
}

export const getOrders = (businessId: string) =>
  request<Order[]>(`/businesses/${businessId}/orders`, undefined, () => mock.mockOrders(businessId));

export const getAnalytics = (businessId: string) =>
  request<Analytics>(`/businesses/${businessId}/analytics`, undefined, () => mock.mockAnalytics(businessId));

/* ---- Shaxsiy agent va muzokara ---- */

/** Shaxsiy agentga so'rov yuboradi va /live uchun matnni eslab qoladi (`negotiation-memory`). */
export async function agentRequest(text: string): Promise<AgentRequestResult> {
  const result = await request<AgentRequestResult>(
    "/agent/request",
    json("POST", { userId: getUserId(), text }),
    () => delay(500, mock.mockAgentRequest(text)),
    AGENT_TIMEOUT_MS,
  );
  rememberRequest(result, text);
  return result;
}

/** Faqat `demo*` id (namuna muzokara) mock tasdiq oladi; haqiqiy muzokara doim serverdan. */
export const confirmNegotiation = (id: string, businessId: string) =>
  id.startsWith("demo")
    ? delay(600, mock.mockConfirm())
    : request<ConfirmResult>(`/negotiations/${id}/confirm`, json("POST", { businessId }), demoUnavailable, AGENT_TIMEOUT_MS);

/* ---- Telegram ulash (soxta "ulangan" yo'q: faqat server javobi) ---- */
export const tgStart = (businessId: string, phone: string) =>
  request<TgConnectStartResult>("/tg-connect/start", json("POST", { businessId, phone }), demoUnavailable, AGENT_TIMEOUT_MS);
export const tgCode = (loginId: string, code: string, password?: string) =>
  request<TgConnectCodeResult>("/tg-connect/code", json("POST", { loginId, code, password }), demoUnavailable, AGENT_TIMEOUT_MS);
export const tgDisconnect = (businessId: string) =>
  request<{ ok: true }>(`/tg-connect?businessId=${encodeURIComponent(businessId)}`, json("DELETE"), demoUnavailable);
/** Biznesning Telegram ulanishi (server haqiqati). */
export const tgStatus = (businessId: string) =>
  request<MeTgStatus>(`/tg-connect?businessId=${encodeURIComponent(businessId)}`, undefined, () => ({ available: false, connected: false }));
/** Server holati: `userbot` = Telegram ulash serverda yoqilganmi. */
export const getHealth = () =>
  request<{ userbot?: boolean } & Record<string, unknown>>("/health", undefined, () => ({ userbot: false }));

/* ---- Inbox ---- */
export const getChats = (businessId: string) =>
  request<Chat[]>(`/inbox?businessId=${encodeURIComponent(businessId)}`, undefined, () => mock.mockChats(businessId));
export const getMessages = (chatId: string) =>
  request<InboxMessage[]>(`/inbox/${chatId}/messages`, undefined, () => mock.mockMessages(chatId));
export const sendMessage = (chatId: string, text: string) =>
  request<InboxMessage>(`/inbox/${chatId}/send`, json("POST", { text }), demoUnavailable);
export const setChatMode = (chatId: string, mode: ChatMode) =>
  request<{ mode: ChatMode }>(`/inbox/${chatId}/mode`, json("PATCH", { mode }), demoUnavailable);

/* ---- Loop / yaxshilash ---- */
export async function runLoop(businessId: string): Promise<LoopProposal[]> {
  const r = await request<LoopProposal[] | { proposals: LoopProposal[] }>(
    "/loop/run",
    json("POST", { businessId }),
    demoUnavailable,
    LOOP_TIMEOUT_MS,
  );
  return Array.isArray(r) ? r : r.proposals;
}
/** Mavjud takliflar (sahifa ochilganda). Demo: bo'sh — foydalanuvchi "Yaxshilash"ni bosadi. */
export const getProposals = (businessId: string) =>
  request<LoopProposal[]>(`/loop/proposals?businessId=${encodeURIComponent(businessId)}`, undefined, () => [] as LoopProposal[]);
export const decideProposal = (id: string, decision: "approve" | "reject") =>
  request<{ ok: true }>(`/loop/proposals/${id}/${decision}`, json("POST"), demoUnavailable);
export const getFacts = (businessId: string) =>
  request<MemoryFact[]>(`/businesses/${businessId}/memory`, undefined, () => mock.mockFacts(businessId));

/* ---- Auth: faqat backend (POST /auth/register, /auth/login, GET /auth/me); sekin uyg'onishga 60 s ---- */
export const login = (phone: string, password: string) =>
  request<AuthResult>("/auth/login", json("POST", { phone, password }), demoUnavailable, AGENT_TIMEOUT_MS);
export const register = (dto: RegisterDto) =>
  request<AuthResult>("/auth/register", json("POST", dto), demoUnavailable, AGENT_TIMEOUT_MS);
export const getMe = (token: string) =>
  request<MeResponse>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }, demoUnavailable, AGENT_TIMEOUT_MS);

/* ---- To'lov holati (3s polling) ---- */
export const getPaymentStatus = (orderId: string) =>
  orderId.startsWith("demo")
    ? Promise.resolve(mock.mockPaymentStatus(orderId))
    : request<PaymentStatus>(`/payments/${encodeURIComponent(orderId)}/status`, undefined, demoUnavailable, TIMEOUT_MS);

/* ---- Rollback ---- */
export const rollbackLoop = (businessId: string) =>
  request<{ ok: true }>("/loop/rollback", json("POST", { businessId }), demoUnavailable);

/* ---- Obuna (Pro): POST /businesses/:id/subscription -> payUrl; holat /payments/:paymentRef/status ---- */
export const getPlans = () => request<BillingPlan[]>("/plans", undefined, () => mock.MOCK_PLANS);
export const subscribePro = (businessId: string) =>
  request<SubscriptionResult>(`/businesses/${encodeURIComponent(businessId)}/subscription`, json("POST", { plan: "pro" }), demoUnavailable);

/* ---- Mijozning shaxsiy Telegrami: /me/tg-connect, /me/actions ---- */
export const meTgStatus = () => request<MeTgStatus>("/me/tg-connect", undefined, () => mock.mockMeTg());
export const meTgStart = (phone: string) =>
  request<{ loginId: string }>("/me/tg-connect/start", json("POST", { phone }), demoUnavailable, AGENT_TIMEOUT_MS);
export const meTgCode = (loginId: string, code: string, password?: string) =>
  request<TgConnectCodeResult>("/me/tg-connect/code", json("POST", { loginId, code, password }), demoUnavailable, AGENT_TIMEOUT_MS);
export const meTgDisconnect = () => request<{ ok: true }>("/me/tg-connect", json("DELETE"), demoUnavailable);
export const getActions = () => request<UserAction[]>("/me/actions", undefined, () => mock.mockActions());
export const decideAction = (id: string, d: "approve" | "reject") =>
  request<{ ok: true }>(`/me/actions/${encodeURIComponent(id)}/${d}`, json("POST"), demoUnavailable);

/* ---- Biznes bilimi (manbalar → qoralama faktlar → egasi tasdiqlaydi) ---- */
const kb = (businessId: string) => `/businesses/${encodeURIComponent(businessId)}/knowledge`;
export const getKnowledge = (businessId: string) =>
  request<KnowledgeOverview>(kb(businessId), undefined, () => mock.mockKnowledge());
export const addKnowledgeText = (businessId: string, text: string, kind: "text" | "voice" = "text") =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/text`, json("POST", { text, kind }), demoUnavailable);
export const addKnowledgeUrl = (businessId: string, url: string) =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/url`, json("POST", { url }), demoUnavailable);
export const addKnowledgeTelegram = (businessId: string, chatIds: string[]) =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/telegram`, json("POST", { chatIds }), demoUnavailable);
export function addKnowledgeFile(businessId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return request<KnowledgeSource>(`${kb(businessId)}/sources/file`, { method: "POST", body: fd }, demoUnavailable);
}
export const confirmFacts = (businessId: string, ids: string[]) =>
  request<{ confirmed: number }>(`${kb(businessId)}/facts/confirm`, json("POST", { ids }), demoUnavailable);
export const patchFact = (businessId: string, factId: string, patch: KnowledgeFactPatch) =>
  request<KnowledgeFact>(`${kb(businessId)}/facts/${encodeURIComponent(factId)}`, json("PATCH", patch), demoUnavailable);
export const answerQuestion = (businessId: string, qid: string, answer: string) =>
  request<PendingQuestion>(`${kb(businessId)}/questions/${encodeURIComponent(qid)}/answer`, json("POST", { answer }), demoUnavailable);
export const dismissQuestion = (businessId: string, qid: string) =>
  request<PendingQuestion>(`${kb(businessId)}/questions/${encodeURIComponent(qid)}/dismiss`, json("POST"), demoUnavailable);
export const createSyncKey = (businessId: string) =>
  request<SyncKeyResult>(`/businesses/${encodeURIComponent(businessId)}/sync-key`, json("POST"), demoUnavailable);
