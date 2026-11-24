// Backend bilan aloqa: ARCHITECTURE.md §5 kontrakti. API yetib bo'lmasa yoki NEXT_PUBLIC_DEMO=1 bo'lsa mock'ga o'tadi.
import type {
  AcceptResult,
  ApiResponse,
  AssistantTask,
  Analytics,
  Business,
  BusinessInput,
  ChatReply,
  ConversationItem,
  ImproveData,
  InboxItem,
  NegotiationEvent,
  NegotiationSession,
  Order,
  Product,
  Suggestion,
  TgMode,
  TgStartResult,
  TgVerifyResult,
} from "./types";
import * as mock from "./mock";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const FORCE_DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || !API_URL;
const TIMEOUT_MS = 4000;

/* ---- rejim holati (UI'da "Demo" belgisi uchun) ---- */
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

/** Tarmoq xatosi, timeout, 404 yoki 5xx = "API yo'q" (mock'ga o'tamiz). 4xx / {ok:false} = haqiqiy xato. */
async function request<T>(path: string, init: RequestInit | undefined, fallback: () => T | Promise<T>): Promise<T> {
  if (FORCE_DEMO) return fallback();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    setDemo(true);
    return fallback();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404 || res.status >= 500) {
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

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/* ---- Biznes ---- */
export const createBusiness = (input: BusinessInput) =>
  request<Business>("/businesses", post(input), () => mock.mockCreateBusiness(input));

export const importCatalog = (businessId: string, products: { name: string; price: number; unit: string }[]) =>
  request<{ imported: number }>(`/businesses/${businessId}/catalog/import`, post({ products }), () => ({
    imported: products.length,
  }));

export const getProducts = (businessId: string) =>
  request<Product[]>(`/businesses/${businessId}/products`, undefined, () => mock.DEMO_PRODUCTS[businessId] ?? []);

export const chatWithBusiness = (businessId: string, text: string) =>
  request<ChatReply>(`/chat/${businessId}`, post({ text }), () => mock.mockChat(businessId, text));

export const getOrders = (businessId: string) =>
  request<Order[]>(`/businesses/${businessId}/orders`, undefined, () => mock.mockOrders(businessId));

export const getConversations = (businessId: string) =>
  request<ConversationItem[]>(`/businesses/${businessId}/conversations`, undefined, () =>
    mock.mockConversations(businessId),
  );

export async function getAnalytics(businessId: string): Promise<Analytics> {
  const a = await request<Analytics>(`/businesses/${businessId}/analytics`, undefined, () =>
    mock.mockAnalytics(businessId),
  );
  // Backend satr massivi qaytarishi mumkin: bir xil shaklga keltiramiz
  const norm = (xs: unknown[]) =>
    (xs ?? []).map((x) => (typeof x === "string" ? { text: x, count: 0 } : (x as { text: string; count: number })));
  return {
    topAsked: norm(a.topAsked),
    missing: norm(a.missing),
    lostClients: (a.lostClients ?? []).map((x) =>
      typeof x === "string" ? { name: x, reason: "", at: "" } : x,
    ),
  };
}

/* ---- Shaxsiy agent ---- */
export const planAssistant = (text: string) =>
  request<{ tasks: AssistantTask[] }>("/assistant", post({ text }), () => ({
    tasks: mock.mockParseAssistant(text),
  }));

/* ---- Muzokara ---- */
const SESSION_KEY = "botir.session.";
function rememberSession(s: NegotiationSession) {
  try {
    sessionStorage.setItem(SESSION_KEY + s.id, JSON.stringify(s));
  } catch {}
}
export function recallSession(id: string): NegotiationSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY + id);
    return raw ? (JSON.parse(raw) as NegotiationSession) : null;
  } catch {
    return null;
  }
}

export async function startNegotiation(businessId: string, request_: string): Promise<NegotiationSession> {
  const s = await request<NegotiationSession>("/negotiations", post({ businessId, request: request_ }), () =>
    mock.mockNegotiationSession(businessId, request_),
  );
  const named = {
    ...s,
    businessName: s.businessName ?? mock.DEMO_BUSINESSES.find((b) => b.id === s.businessId)?.name,
    request: s.request ?? request_,
  };
  rememberSession(named);
  return named;
}

/** SSE: GET /negotiations/:id/stream. Ulanib bo'lmasa skriptli mock'ga o'tadi. Qaytargani: yopish. */
export function streamNegotiation(
  id: string,
  onEvent: (e: NegotiationEvent) => void,
  onFail?: (msg: string) => void,
): () => void {
  const sess = recallSession(id);
  let stopMock: (() => void) | null = null;
  let es: EventSource | null = null;
  let received = false;

  const startMock = () => {
    setDemo(true);
    stopMock = mock.runMockStream(id, sess?.request, onEvent);
  };

  if (FORCE_DEMO || id.startsWith("demo")) {
    startMock();
  } else {
    es = new EventSource(`${API_URL}/negotiations/${encodeURIComponent(id)}/stream`);
    const handle = (type: NegotiationEvent["type"]) => (ev: MessageEvent<string>) => {
      received = true;
      try {
        const data = JSON.parse(ev.data);
        // Backend ikki shaklda yuborishi mumkin: {type,...} yoki faqat payload
        if (data && data.type) onEvent(data as NegotiationEvent);
        else if (type === "message") onEvent({ type, message: data });
        else if (type === "offer") onEvent({ type, offer: data });
        else onEvent({ type: "status", status: data.status ?? data });
      } catch {
        onFail?.("Oqimdan noto'g'ri ma'lumot keldi");
      }
    };
    (["message", "offer", "status"] as const).forEach((t) => es!.addEventListener(t, handle(t) as EventListener));
    es.onerror = () => {
      es?.close();
      es = null;
      if (!received) startMock();
      else onFail?.("Ulanish uzildi");
    };
  }
  return () => {
    stopMock?.();
    es?.close();
  };
}

export const acceptOffer = (offerId: string) =>
  request<AcceptResult>(`/offers/${offerId}/accept`, post({}), () => mock.mockAccept(offerId));

/* ---- Telegram ulash (kontraktda yo'q: demo fallback) ---- */
export const tgStart = (phone: string) =>
  request<TgStartResult>("/channels/telegram/start", post({ phone }), () => ({ requestId: `demo-${Date.now()}` }));
export const tgVerify = (requestId: string, code: string) =>
  request<TgVerifyResult>("/channels/telegram/verify", post({ requestId, code }), () => ({ status: "need_2fa" }));
export const tgPassword = (requestId: string, password: string) =>
  request<{ ok: true }>("/channels/telegram/2fa", post({ requestId, password }), () => ({ ok: true }));
export const tgSetMode = (mode: TgMode) =>
  request<{ mode: TgMode }>("/channels/telegram/mode", post({ mode }), () => ({ mode }));

/* ---- Inbox / yaxshilash ---- */
export const getInbox = (businessId: string) =>
  request<InboxItem[]>(`/businesses/${businessId}/inbox`, undefined, () => mock.mockInbox(businessId));
export const sendReply = (itemId: string, text: string) =>
  request<{ ok: true }>(`/inbox/${itemId}/send`, post({ text }), () => ({ ok: true }));
export const getImprove = (businessId: string) =>
  request<ImproveData>(`/businesses/${businessId}/improvements`, undefined, () => mock.mockImprove());
export const decideSuggestion = (id: string, status: Suggestion["status"]) =>
  request<{ ok: true }>(`/improvements/${id}/decision`, post({ status }), () => ({ ok: true }));
