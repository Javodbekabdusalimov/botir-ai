/**
 * Backend bilan aloqa: docs/ARCHITECTURE.md §6.
 *
 * Har funksiya `request(path, init, fallback)` orqali ishlaydi: API yetib bo'lmasa (yoki
 * `NEXT_PUBLIC_DEMO=1`) `fallback` ichidagi mock ma'lumot qaytadi va UI "Demo" belgisini ko'rsatadi.
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
import { ApiError, delay, json, request } from "./http";
import { rememberRequest } from "./negotiation-memory";

export { modeStore } from "./config";
export { ApiError, NotFoundError, TOKEN_KEY, getToken, setToken } from "./http";
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
  request<Business>("/businesses", json("POST", dto), () => mock.mockCreateBusiness(dto));

/** Kontrakt: fayl yuboriladi (server o'zi o'qiydi). Fayl bo'lmasa (namuna katalog) qatorlar JSON bilan ketadi. */
export function importCatalog(businessId: string, file: File | null, rows: CatalogRowInput[]) {
  const init: RequestInit = file
    ? (() => {
        const fd = new FormData();
        fd.append("file", file);
        return { method: "POST", body: fd };
      })()
    : json("POST", { rows });
  return request<CatalogImportResult>(`/businesses/${businessId}/catalog/import`, init, () => mock.mockImport(rows));
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
    () => delay(DEMO_AGENT_LATENCY_MS, mock.mockAgentRequest(text)),
    AGENT_TIMEOUT_MS,
  );
  rememberRequest(result, text);
  return result;
}

export const confirmNegotiation = (id: string, businessId: string) =>
  request<ConfirmResult>(
    `/negotiations/${id}/confirm`,
    json("POST", { businessId }),
    () => delay(600, mock.mockConfirm()),
    AGENT_TIMEOUT_MS,
  );

/* ---- Telegram ulash (demo: kod bosqichi demoCodeStatus bilan) ---- */
const needPassword = new Set<string>();
const MIN_CODE_LENGTH = 5;

/** Demo rejimda Telegram kod bosqichi: qisqa kod = xato, birinchi urinishda 2FA so'raladi, keyin ulanadi. */
function demoCodeStatus(key: string, code: string, password?: string): TgConnectCodeResult["status"] {
  if (code.length < MIN_CODE_LENGTH) return "invalid_code";
  if (!password && !needPassword.has(key)) {
    needPassword.add(key);
    return "need_password";
  }
  return "connected";
}
const DEMO_CODE_LATENCY_MS = 600;
const DEMO_AGENT_LATENCY_MS = 500;
export const tgStart = (businessId: string, phone: string) =>
  request<TgConnectStartResult>("/tg-connect/start", json("POST", { businessId, phone }), () =>
    delay(500, { loginId: `demo-${Date.now()}` }),
  );
export const tgCode = (loginId: string, code: string, password?: string) =>
  request<TgConnectCodeResult>("/tg-connect/code", json("POST", { loginId, code, password }), () =>
    delay(DEMO_CODE_LATENCY_MS, { status: demoCodeStatus(loginId, code, password) }),
  );
export const tgDisconnect = (businessId: string) =>
  request<{ ok: true }>(`/tg-connect?businessId=${encodeURIComponent(businessId)}`, json("DELETE"), () => ({ ok: true as const }));

/* ---- Inbox ---- */
export const getChats = (businessId: string) =>
  request<Chat[]>(`/inbox?businessId=${encodeURIComponent(businessId)}`, undefined, () => mock.mockChats(businessId));
export const getMessages = (chatId: string) =>
  request<InboxMessage[]>(`/inbox/${chatId}/messages`, undefined, () => mock.mockMessages(chatId));
export const sendMessage = (chatId: string, text: string) =>
  request<InboxMessage>(`/inbox/${chatId}/send`, json("POST", { text }), () =>
    delay(400, {
      id: `sent-${Date.now()}`,
      chatId,
      direction: "out" as const,
      author: "owner" as const,
      text,
      sentAt: new Date().toISOString(),
    }),
  );
export const setChatMode = (chatId: string, mode: ChatMode) =>
  request<{ mode: ChatMode }>(`/inbox/${chatId}/mode`, json("PATCH", { mode }), () => mock.mockSetMode(chatId, mode));

/* ---- Loop / yaxshilash ---- */
export async function runLoop(businessId: string): Promise<LoopProposal[]> {
  const r = await request<LoopProposal[] | { proposals: LoopProposal[] }>(
    "/loop/run",
    json("POST", { businessId }),
    () => delay(1400, mock.mockLoop(businessId)),
    LOOP_TIMEOUT_MS,
  );
  return Array.isArray(r) ? r : r.proposals;
}
/** Mavjud takliflar (sahifa ochilganda). Demo: bo'sh — foydalanuvchi "Yaxshilash"ni bosadi. */
export const getProposals = (businessId: string) =>
  request<LoopProposal[]>(`/loop/proposals?businessId=${encodeURIComponent(businessId)}`, undefined, () => [] as LoopProposal[]);
export const decideProposal = (id: string, decision: "approve" | "reject") =>
  request<{ ok: true }>(`/loop/proposals/${id}/${decision}`, json("POST"), () => ({ ok: true as const }));
export const getFacts = (businessId: string) =>
  request<MemoryFact[]>(`/businesses/${businessId}/memory`, undefined, () => mock.mockFacts(businessId));

/* ---- Auth: backend (POST /auth/register, /auth/login, GET /auth/me) yoki demo ---- */
export const login = (phone: string, password: string) =>
  request<AuthResult>("/auth/login", json("POST", { phone, password }), () => {
    const r = mock.mockLogin(phone, password);
    if (!r) throw new ApiError("Telefon yoki parol noto'g'ri");
    return delay(500, r);
  });
export const register = (dto: RegisterDto) =>
  request<AuthResult>("/auth/register", json("POST", dto), () => {
    const r = mock.mockRegister(dto);
    if (r === "exists") throw new ApiError("Bu telefon raqami allaqachon ro'yxatdan o'tgan");
    return delay(500, r);
  });
export const getMe = (token: string) =>
  request<MeResponse>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }, () => {
    const me = mock.mockMe(token);
    if (!me) throw new ApiError("Sessiya tugagan");
    return me;
  });

/* ---- To'lov holati (3s polling) ---- */
export const getPaymentStatus = (orderId: string) =>
  orderId.startsWith("demo")
    ? Promise.resolve(mock.mockPaymentStatus(orderId))
    : request<PaymentStatus>(`/payments/${encodeURIComponent(orderId)}/status`, undefined, () => mock.mockPaymentStatus(orderId), TIMEOUT_MS, {
        notFoundError: true,
      });

/* ---- Rollback ---- */
export const rollbackLoop = (businessId: string) =>
  request<{ ok: true }>("/loop/rollback", json("POST", { businessId }), () => delay(500, { ok: true as const }));

/* ---- Obuna (Pro): POST /businesses/:id/subscription -> payUrl; holat /payments/:paymentRef/status ---- */
export const getPlans = () => request<BillingPlan[]>("/plans", undefined, () => mock.MOCK_PLANS);
export const subscribePro = (businessId: string) =>
  request<SubscriptionResult>(`/businesses/${encodeURIComponent(businessId)}/subscription`, json("POST", { plan: "pro" }), () => mock.mockSubscribe());

/* ---- Mijozning shaxsiy Telegrami: /me/tg-connect, /me/actions ---- */
export const meTgStatus = () => request<MeTgStatus>("/me/tg-connect", undefined, () => mock.mockMeTg());
export const meTgStart = (phone: string) =>
  request<{ loginId: string }>("/me/tg-connect/start", json("POST", { phone }), () => delay(500, { loginId: `demo-${Date.now()}` }));
export const meTgCode = (loginId: string, code: string, password?: string) =>
  request<TgConnectCodeResult>("/me/tg-connect/code", json("POST", { loginId, code, password }), () => {
    const status = demoCodeStatus(`me-${loginId}`, code, password);
    if (status === "connected") mock.setMockMeTg(true);
    return delay(DEMO_CODE_LATENCY_MS, { status });
  });
export const meTgDisconnect = () =>
  request<{ ok: true }>("/me/tg-connect", json("DELETE"), () => {
    mock.setMockMeTg(false);
    return { ok: true as const };
  });
export const getActions = () => request<UserAction[]>("/me/actions", undefined, () => mock.mockActions());
export const decideAction = (id: string, d: "approve" | "reject") =>
  request<{ ok: true }>(`/me/actions/${encodeURIComponent(id)}/${d}`, json("POST"), () => {
    mock.mockDecideAction(id, d);
    return delay(400, { ok: true as const });
  });

/* ---- Biznes bilimi (manbalar → qoralama faktlar → egasi tasdiqlaydi) ---- */
const kb = (businessId: string) => `/businesses/${encodeURIComponent(businessId)}/knowledge`;
export const getKnowledge = (businessId: string) =>
  request<KnowledgeOverview>(kb(businessId), undefined, () => mock.mockKnowledge());
export const addKnowledgeText = (businessId: string, text: string, kind: "text" | "voice" = "text") =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/text`, json("POST", { text, kind }), () => mock.mockKnowledgeSource(kind, text));
export const addKnowledgeUrl = (businessId: string, url: string) =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/url`, json("POST", { url }), () => mock.mockKnowledgeSource("website", url));
export const addKnowledgeTelegram = (businessId: string, chatIds: string[]) =>
  request<KnowledgeSource>(`${kb(businessId)}/sources/telegram`, json("POST", { chatIds }), () =>
    mock.mockKnowledgeSource("telegram", `${chatIds.length} ta chat`),
  );
export function addKnowledgeFile(businessId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return request<KnowledgeSource>(`${kb(businessId)}/sources/file`, { method: "POST", body: fd }, () =>
    mock.mockKnowledgeSource(file.type === "application/pdf" ? "pdf" : "photo", file.name),
  );
}
export const confirmFacts = (businessId: string, ids: string[]) =>
  request<{ confirmed: number }>(`${kb(businessId)}/facts/confirm`, json("POST", { ids }), () => ({ confirmed: ids.length }));
export const patchFact = (businessId: string, factId: string, patch: KnowledgeFactPatch) =>
  request<KnowledgeFact>(`${kb(businessId)}/facts/${encodeURIComponent(factId)}`, json("PATCH", patch), () => mock.mockPatchFact(factId, patch));
export const answerQuestion = (businessId: string, qid: string, answer: string) =>
  request<PendingQuestion>(`${kb(businessId)}/questions/${encodeURIComponent(qid)}/answer`, json("POST", { answer }), () =>
    mock.mockAnswerQuestion(qid, answer),
  );
export const dismissQuestion = (businessId: string, qid: string) =>
  request<PendingQuestion>(`${kb(businessId)}/questions/${encodeURIComponent(qid)}/dismiss`, json("POST"), () =>
    mock.mockDismissQuestion(qid),
  );
export const createSyncKey = (businessId: string) =>
  request<SyncKeyResult>(`/businesses/${encodeURIComponent(businessId)}/sync-key`, json("POST"), () => ({ key: "demo-sync-key" }));
