// Demo rejim (davomi): akkaunt, billing, amallar, to'lov holati va bilimlar. mock.ts dan qayta eksport qilinadi.
import type {
  KnowledgeFact,
  KnowledgeFactPatch,
  KnowledgeOverview,
  KnowledgeSource,
  KnowledgeSourceKind,
  PendingQuestion,
  AuthResult,
  AuthUser,
  MeResponse,
  MeTgStatus,
  PaymentStatus,
  Plan as BillingPlan,
  RegisterDto,
  SubscriptionResult,
  UserAction,
} from "./types";

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const rid = () => Math.random().toString(36).slice(2, 8);

/* ---------- Auth (demo): test akkauntlar + brauzerda saqlanadigan ro'yxatdan o'tganlar ---------- */
// Faqat demo rejim uchun: parol brauzer localStorage'ida ochiq turadi. Haqiqiy backend ulanganda ishlatilmaydi.

export const TEST_ACCOUNTS = {
  business: { phone: "+998900000001", password: "botir123" },
  user: { phone: "+998900000002", password: "botir123" },
} as const;

const SEED: (AuthUser & { password: string })[] = [
  { id: "u-biz", name: "Chilonzor Osh Markazi", phone: TEST_ACCOUNTS.business.phone, password: TEST_ACCOUNTS.business.password, role: "business", businessId: "chorsu" },
  { id: "u-client", name: "Test Mijoz", phone: TEST_ACCOUNTS.user.phone, password: TEST_ACCOUNTS.user.password, role: "user" },
];
const USERS_KEY = "botir.mockUsers";

function loadUsers(): (AuthUser & { password: string })[] {
  try {
    const extra = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as (AuthUser & { password: string })[];
    return [...SEED, ...extra];
  } catch {
    return SEED;
  }
}
const strip = (u: AuthUser & { password: string }): AuthUser => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, businessId: u.businessId });

export function mockLogin(phone: string, password: string): AuthResult | null {
  const u = loadUsers().find((x) => x.phone === phone && x.password === password);
  return u ? { token: `mock.${u.id}`, user: strip(u) } : null;
}
export function mockRegister(dto: RegisterDto): AuthResult | "exists" {
  if (loadUsers().some((x) => x.phone === dto.phone)) return "exists";
  const u = { id: `u-${rid()}`, name: dto.name, phone: dto.phone, password: dto.password, role: dto.role };
  try {
    const extra = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]");
    localStorage.setItem(USERS_KEY, JSON.stringify([...extra, u]));
  } catch {}
  return { token: `mock.${u.id}`, user: strip(u) };
}
export function mockMe(token: string): MeResponse | null {
  const u = loadUsers().find((x) => `mock.${x.id}` === token);
  if (!u) return null;
  const user = strip(u);
  if (u.role !== "business" || !u.businessId) return { user };
  let plan: "start" | "pro" = "start";
  let planUntil: string | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(`botir.plan.${u.businessId}`) ?? "null") as { until: string } | null;
    if (saved && new Date(saved.until) > new Date()) {
      plan = "pro";
      planUntil = saved.until;
    }
  } catch {}
  return { user, businessId: u.businessId, business: { id: u.businessId, name: u.name, plan, planUntil, aiCredits: plan === "pro" ? 1000 : 100 } };
}

export const MOCK_PLANS: BillingPlan[] = [
  { id: "free", name: "Free", price: 0, aiCredits: 100, periodDays: 30 },
  { id: "pro", name: "Pro", price: 82000, aiCredits: 1000, dailyTokens: 100000, periodDays: 30 },
  { id: "max", name: "Max", price: 163000, aiCredits: 1000, dailyTokens: 200000, periodDays: 30 },
];
export function mockSubscribe(): SubscriptionResult {
  const ref = `sub-${rid()}`;
  return { paymentRef: ref, payUrl: `/pay/${ref}`, amount: 1000 };
}
/** Pro faollashganda demo rejimda 30 kunlik muddat saqlanadi */
export function mockActivatePro(businessId: string) {
  try {
    localStorage.setItem(`botir.plan.${businessId}`, JSON.stringify({ until: new Date(Date.now() + 30 * 86400_000).toISOString() }));
  } catch {}
}

/* ---------- Mijozning shaxsiy Telegrami va AI ruxsat so'ragan amallar (demo) ---------- */
const ME_TG = "botir.meTg";
export function mockMeTg(): MeTgStatus {
  try {
    const on = localStorage.getItem(ME_TG) === "1";
    return { available: true, connected: on, username: on ? "demo_user" : undefined, connectedAt: on ? new Date().toISOString() : undefined };
  } catch {
    return { available: true, connected: false };
  }
}
export function setMockMeTg(on: boolean) {
  try {
    if (on) localStorage.setItem(ME_TG, "1");
    else localStorage.removeItem(ME_TG);
  } catch {}
}
let actions: UserAction[] | null = null;
export function mockActions(): UserAction[] {
  actions ??= [
    { id: "a1", chatId: "c1", peerTitle: "Chilonzor Osh Markazi", text: "Assalomu alaykum! Ertaga 19:00 ga 6 kishilik joy band qilmoqchiman. Bo'shmi?", status: "pending", reason: "Siz: \"Botir, ertaga osh joy band qil\"", createdAt: iso(4) },
    { id: "a2", chatId: "c2", peerTitle: "Chilonzor AutoServis", text: "Salom, shanba kuni Cobalt uchun moy almashtirish mumkinmi? Narxi qancha?", status: "pending", reason: "Siz: \"Botir, moy almashtirishga yoz\"", createdAt: iso(11) },
    { id: "a3", chatId: "c3", peerTitle: "Malika Do'kon", text: "Salom! 10 kg guruch va 2 litr yog' yetkazib bera olasizmi?", status: "sent", createdAt: iso(95) },
  ];
  return actions.map((a) => ({ ...a }));
}
export function mockDecideAction(id: string, d: "approve" | "reject") {
  mockActions();
  actions = actions!.map((a) => (a.id === id ? { ...a, status: d === "approve" ? "sent" : "rejected" } : a));
}
/** To'lov holati: tasdiqdan ~5s keyin "paid". */
export function mockPaymentStatus(orderId: string): PaymentStatus {
  const key = `botir.pay.${orderId}`;
  let started = Date.now();
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) started = Number(saved);
    else sessionStorage.setItem(key, String(started));
  } catch {}
  return { status: Date.now() - started >= 5000 ? "paid" : "pending", isTest: true, payUrl: `/pay/${orderId}` };
}

/* ---- Biznes bilimi (demo) ---- */
const kbNow = () => new Date().toISOString();
const KB_SOURCES: KnowledgeSource[] = [
  { id: "src-1", kind: "text", label: "Menyu va ish vaqti", status: "ready", factsCount: 4, createdAt: kbNow() },
];
const KB_FACTS: KnowledgeFact[] = [
  { id: "f-1", sourceId: "src-1", sourceKind: "text", kind: "catalog", topic: "catalog", content: "To'y oshi, 1 porsiya", price: 45000, unit: "porsiya", confidence: 0.92, status: "draft", createdAt: kbNow() },
  { id: "f-2", sourceId: "src-1", sourceKind: "text", kind: "policy", topic: "delivery", content: "Chilonzor ichida yetkazib berish bepul, 40 daqiqada", confidence: 0.81, status: "draft", createdAt: kbNow() },
  { id: "f-3", sourceId: "src-1", sourceKind: "text", kind: "profile", topic: "hours", content: "Har kuni 09:00–23:00", confidence: 0.95, status: "confirmed", createdAt: kbNow() },
  { id: "f-4", sourceId: "src-1", sourceKind: "text", kind: "faq", topic: "payment", question: "Karta bilan to'lasa bo'ladimi?", content: "Ha, Click va Payme orqali", confidence: 0.42, status: "draft", createdAt: kbNow() },
];
const KB_QUESTIONS: PendingQuestion[] = [
  { id: "q-1", question: "Bolalar maydonchasi bormi?", timesAsked: 3, status: "open", createdAt: kbNow() },
];
export const mockKnowledge = (): KnowledgeOverview => ({
  sources: KB_SOURCES,
  facts: KB_FACTS,
  questions: KB_QUESTIONS,
  metrics: { aiAnsweredPct: null, aiTurns: 0, minutesToReady: null, missingTopics: ["booking"] },
});
export function mockKnowledgeSource(kind: KnowledgeSourceKind, label: string) {
  const s = { id: `src-${Date.now()}`, kind, label: label.slice(0, 60), status: "ready" as const, factsCount: 0, createdAt: kbNow() };
  KB_SOURCES.unshift(s);
  return s;
}
export function mockPatchFact(id: string, patch: KnowledgeFactPatch) {
  const f = KB_FACTS.find((x) => x.id === id) ?? KB_FACTS[0];
  Object.assign(f, patch);
  return f;
}
export function mockAnswerQuestion(id: string, answer: string) {
  const q = KB_QUESTIONS.find((x) => x.id === id) ?? KB_QUESTIONS[0];
  Object.assign(q, { status: "answered", answer });
  return q;
}
export function mockDismissQuestion(id: string) {
  const q = KB_QUESTIONS.find((x) => x.id === id) ?? KB_QUESTIONS[0];
  q.status = "dismissed";
  return q;
}
