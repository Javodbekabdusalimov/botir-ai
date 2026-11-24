// Backend bilan aloqa: docs/ARCHITECTURE.md §6. API yetib bo'lmasa yoki NEXT_PUBLIC_DEMO=1 bo'lsa mock'ga o'tadi.
import type {
  AgentRequestResult,
  Analytics,
  Business,
  CatalogImportResult,
  CatalogRowInput,
  Chat,
  ChatMode,
  ConfirmResult,
  CreateBusinessDto,
  InboxMessage,
  LoopProposal,
  MemoryFact,
  NegotiationEvent,
  Order,
  TgConnectCodeResult,
  TgConnectStartResult,
  AuthResult,
  MeResponse,
  MeTgStatus,
  PaymentStatus,
  Plan as BillingPlan,
  RegisterDto,
  SubscriptionResult,
  UserAction,
} from "./types";
import type { ApiResponse } from "@botir/shared";
import * as mock from "./mock";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const FORCE_DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || !API_URL;
const TIMEOUT_MS = 4000;
/** LLM ishlaydigan endpointlar sekin: /loop/run ~90s, agent so'rovi/tasdiq bir necha soniya. */
const LOOP_TIMEOUT_MS = 180_000;
const AGENT_TIMEOUT_MS = 60_000;

/* ---- rejim holati ("Demo" / "Jonli" belgisi uchun) ---- */
let demoActive = FORCE_DEMO;
const listeners = new Set<() => void>();
function setDemo(v: boolean) {
  if (demoActive === v) return;
  demoActive = v;
  listeners.forEach((l) => l());
}
export const modeStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getSnapshot: () => demoActive,
  getServerSnapshot: () => FORCE_DEMO,
};

export class ApiError extends Error {}
export class NotFoundError extends ApiError {}

/* ---- Token (localStorage 'botir_token') ---- */
export const TOKEN_KEY = "botir_token";
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
function authHeader(): Record<string, string> {
  const t = typeof window === "undefined" ? null : getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Tarmoq xatosi, timeout, 404 yoki 5xx = "API yo'q" (mock'ga o'tamiz). 4xx / {ok:false} = haqiqiy xato. */
async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallback: () => T | Promise<T>,
  timeoutMs: number = TIMEOUT_MS,
  opts: { notFoundError?: boolean } = {},
): Promise<T> {
  if (FORCE_DEMO) return fallback();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...authHeader(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    setDemo(true);
    return fallback();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    // Server javob berdi = backend tirik. "Demo"ga o'tmaymiz (aks holda belgi Jonli/Demo o'rtasida sakraydi).
    setDemo(false);
    if (opts.notFoundError) throw new NotFoundError("Topilmadi");
    return fallback();
  }
  if (res.status >= 500) {
    setDemo(true);
    return fallback();
  }
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    setDemo(true);
    return fallback();
  }
  setDemo(false);
  if (!body.ok) throw new ApiError(body.error || "Xatolik yuz berdi");
  return body.data;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const delay = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

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
const NEG_KEY = "botir.neg.";

export async function agentRequest(text: string): Promise<AgentRequestResult> {
  const r = await request<AgentRequestResult>(
    "/agent/request",
    json("POST", { userId: getUserId(), text }),
    () => delay(500, mock.mockAgentRequest(text)),
    AGENT_TIMEOUT_MS,
  );
  try {
    // /live ekrani uchun so'rov matnlarini eslab qolamiz (mock skripti ishlatadi)
    const needs: Record<string, string> = {};
    r.tasks.forEach((t) => {
      const key = t.category === "autoservice" ? "chilonzor" : t.category === "shop" ? "malika" : "chorsu";
      needs[key] = t.need;
    });
    sessionStorage.setItem(NEG_KEY + r.negotiationId, JSON.stringify({ needs, text }));
  } catch {}
  return r;
}

/** /live "Qayta urinish" uchun asl so'rov matni. */
export function recallRequestText(id: string): string | undefined {
  try {
    const raw = sessionStorage.getItem(NEG_KEY + id);
    return raw ? ((JSON.parse(raw).text as string | undefined) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

function recallNeeds(id: string): Record<string, string> | undefined {
  try {
    const raw = sessionStorage.getItem(NEG_KEY + id);
    return raw ? (JSON.parse(raw).needs as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

/** SSE: GET /negotiations/:id/stream. Ulanib bo'lmasa skriptli mock'ga o'tadi. Qaytargani: yopish. */
export function streamNegotiation(
  id: string,
  onEvent: (e: NegotiationEvent) => void,
  onFail?: (msg: string) => void,
): () => void {
  let stopMock: (() => void) | null = null;
  let es: EventSource | null = null;
  let received = false;
  let finished = false;
  const startMock = () => {
    setDemo(true);
    stopMock = mock.runMockStream(id, recallNeeds(id), onEvent);
  };

  if (FORCE_DEMO || id.startsWith("demo")) {
    startMock();
  } else {
    // Server qayta ulanishda o'tgan eventlarni replay qiladi: takrorlarni tashlab yuboramiz.
    const seen = new Set<string>();
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const handle = (ev: MessageEvent<string>) => {
      if (typeof ev.data !== "string") return; // EventSource ulanish "error" hodisasi (ma'lumotsiz) onerror'da hal qilinadi
      received = true;
      attempts = 0;
      if (seen.has(ev.data)) return;
      seen.add(ev.data);
      try {
        const parsed = JSON.parse(ev.data) as NegotiationEvent;
        if (parsed.type === "status" && parsed.status !== "running") finished = true;
        onEvent(parsed);
      } catch {
        onFail?.("Oqimdan noto'g'ri ma'lumot keldi");
      }
    };
    const connect = () => {
      if (stopped) return;
      es = new EventSource(`${API_URL}/negotiations/${encodeURIComponent(id)}/stream`);
      // Kontrakt: har SSE data = JSON.stringify(NegotiationEvent). onmessage qo'shilmaydi, aks holda har xabar 2 marta chiqadi.
      (["message", "best_offer", "status", "error"] as const).forEach((t) => es!.addEventListener(t, handle as EventListener));
      es.onerror = () => {
        es?.close();
        es = null;
        if (finished || stopped) return; // server tugaganda oqimni yopadi: bu xato emas
        // Avto-qayta ulanish ("Ulanmoqda…" holati UI'da qoladi): 1s, 2s, 4s, 4s, 4s
        if (attempts < 5) {
          const wait = Math.min(1000 * 2 ** attempts, 4000);
          attempts += 1;
          retryTimer = setTimeout(connect, wait);
          return;
        }
        if (!received) startMock();
        else onFail?.("Aloqa uzildi. Qayta ulanish tugmasini bosing.");
      };
    };
    connect();
    const prevStop = () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    return () => {
      prevStop();
      stopMock?.();
      es?.close();
    };
  }
  return () => {
    stopMock?.();
    es?.close();
  };
}

export const confirmNegotiation = (id: string, businessId: string) =>
  request<ConfirmResult>(
    `/negotiations/${id}/confirm`,
    json("POST", { businessId }),
    () => delay(600, mock.mockConfirm()),
    AGENT_TIMEOUT_MS,
  );

/* ---- Telegram ulash ---- */
const needPassword = new Set<string>();
export const tgStart = (businessId: string, phone: string) =>
  request<TgConnectStartResult>("/tg-connect/start", json("POST", { businessId, phone }), () =>
    delay(500, { loginId: `demo-${Date.now()}` }),
  );
export const tgCode = (loginId: string, code: string, password?: string) =>
  request<TgConnectCodeResult>("/tg-connect/code", json("POST", { loginId, code, password }), () => {
    let status: TgConnectCodeResult["status"];
    if (code.length < 5) status = "invalid_code";
    else if (!password && !needPassword.has(loginId)) {
      needPassword.add(loginId);
      status = "need_password";
    } else status = "connected";
    return delay(600, { status });
  });
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
    let status: TgConnectCodeResult["status"];
    if (code.length < 5) status = "invalid_code";
    else if (!password && !needPassword.has(`me-${loginId}`)) {
      needPassword.add(`me-${loginId}`);
      status = "need_password";
    } else {
      status = "connected";
      mock.setMockMeTg(true);
    }
    return delay(600, { status });
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
