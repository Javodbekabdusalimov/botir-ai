// Demo rejim: backend yo'q bo'lganda yoki NEXT_PUBLIC_DEMO=1 da ishlaydigan realistik stsenariylar.
import type {
  A2APayload,
  AgentRequestResult,
  Analytics,
  Business,
  BusinessCategory,
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
  NegotiationMessage,
  NegotiationTask,
  Order,
  OrderItem,
} from "./types";
import { formatSom } from "./format";

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const rid = () => Math.random().toString(36).slice(2, 8);
const ALL_DAYS = { mon: ["09:00", "22:00"], tue: ["09:00", "22:00"], wed: ["09:00", "22:00"], thu: ["09:00", "22:00"], fri: ["09:00", "22:00"], sat: ["09:00", "22:00"], sun: ["09:00", "22:00"] } as Business["workHours"];

function biz(id: string, name: string, category: BusinessCategory, district: string, address: string, maxDiscountPct: number): Business {
  return { id, name, category, district, address, maxDiscountPct, workHours: ALL_DAYS, lang: "uz", ownerUserId: "demo-owner", isDemo: true, createdAt: "2026-11-20T09:00:00Z", updatedAt: "2026-11-20T09:00:00Z" };
}

/** Panelda tanlanadigan 3 ta demo biznes */
export const DEMO_BUSINESSES: Business[] = [
  biz("chorsu", "Chilonzor Osh Markazi", "restaurant", "Chilonzor", "Chilonzor, 9-kvartal", 10),
  biz("chilonzor", "Chilonzor AutoServis", "autoservice", "Chilonzor", "9-kvartal", 12),
  biz("malika", "Malika Do'kon", "shop", "Yunusobod", "4-kvartal", 7),
];
/** Parallel muzokarada raqobatchi sifatida ishtirok etadi */
const COMPETITORS: Business[] = [
  biz("besh", "Namuna Osh Yunusobod", "restaurant", "Yunusobod", "Amir Temur shoh ko'chasi", 8),
  biz("samarqand", "Samarqand Oshxonasi", "restaurant", "Mirzo Ulug'bek", "Mustaqillik ko'chasi", 12),
];
export const ALL_MOCK_BUSINESSES = [...DEMO_BUSINESSES, ...COMPETITORS];

export const SAMPLE_CATALOG: CatalogRowInput[] = [
  { name: "To'y oshi", price: 45000, unit: "porsiya" },
  { name: "Tandir non", price: 4000, unit: "dona" },
  { name: "Ko'k choy (choynak)", price: 15000, unit: "dona" },
  { name: "Achchiq-chuchuk salat", price: 12000, unit: "porsiya" },
  { name: "Qo'y go'shti kabobi", price: 18000, unit: "shish" },
];

/* ---------- A2A muzokara (maks 3 raund) ---------- */

interface Plan {
  items: { name: string; price: number; qty: number }[];
  offers: [number, number, number]; // har raunddagi taklif chegirmasi
  asks: [number, number]; // 2- va 3-raund COUNTER so'ragan chegirma
  need: string;
}

const PLANS: Record<string, Plan> = {
  chorsu: { items: [{ name: "To'y oshi", price: 45000, qty: 6 }, { name: "Tandir non", price: 4000, qty: 6 }, { name: "Ko'k choy", price: 15000, qty: 2 }, { name: "Salat", price: 12000, qty: 2 }], offers: [0, 5, 8], asks: [10, 10], need: "Ertaga 19:00 ga 6 kishilik osh joy kerak, byudjet 300 ming atrofida." },
  besh: { items: [{ name: "To'y oshi", price: 42000, qty: 6 }, { name: "Tandir non", price: 3500, qty: 6 }, { name: "Ko'k choy", price: 12000, qty: 2 }, { name: "Salat", price: 10000, qty: 2 }], offers: [0, 3, 6], asks: [10, 8], need: "Ertaga 19:00 ga 6 kishilik osh joy kerak, byudjet 300 ming atrofida." },
  samarqand: { items: [{ name: "To'y oshi", price: 48000, qty: 6 }, { name: "Tandir non", price: 4000, qty: 6 }, { name: "Ko'k choy", price: 15000, qty: 2 }, { name: "Salat", price: 12000, qty: 2 }], offers: [0, 5, 10], asks: [12, 12], need: "Ertaga 19:00 ga 6 kishilik osh joy kerak, byudjet 300 ming atrofida." },
  chilonzor: { items: [{ name: "Moy almashtirish (ish haqi)", price: 120000, qty: 1 }, { name: "Moy filtri", price: 45000, qty: 1 }, { name: "Kompyuter diagnostikasi", price: 80000, qty: 1 }], offers: [0, 6, 10], asks: [12, 12], need: "Cobalt uchun moy almashtirish va diagnostika, shanba ertalab." },
  malika: { items: [{ name: "Lazer guruch 5 kg", price: 85000, qty: 2 }, { name: "Kungaboqar yog'i 5 l", price: 78000, qty: 1 }, { name: "Shakar 2 kg", price: 28000, qty: 2 }, { name: "Un 10 kg", price: 65000, qty: 1 }, { name: "Ahmad choy", price: 22000, qty: 1 }], offers: [0, 3, 5], asks: [7, 7], need: "Oylik oziq-ovqat to'plami, bugun yetkazib bering." },
};

const MULTI = ["chorsu", "besh", "samarqand"];

/** negotiationId ichidan biznes chiziqlari: "demo-chorsu+chilonzor-ab12" yoki "demo-multi-ab12" */
export function laneKeys(id: string): string[] {
  let raw = id;
  try {
    raw = decodeURIComponent(id); // "%2B" -> "+"
  } catch {}
  const seg = /^demo-([a-z+]+)/.exec(raw)?.[1] ?? "multi";
  if (seg === "multi") return MULTI;
  const keys = seg.split("+").filter((k) => PLANS[k]).slice(0, 3);
  return keys.length ? keys : ["chorsu"];
}

export function negotiationIdFor(tasks: NegotiationTask[]): string {
  const cats = tasks.map((t) => t.category);
  const keyOf = (c: BusinessCategory) => (c === "autoservice" ? "chilonzor" : c === "shop" ? "malika" : "chorsu");
  const uniq = [...new Set(cats.map(keyOf))];
  const seg = uniq.length === 1 && uniq[0] === "chorsu" ? "multi" : uniq.join("+");
  return `demo-${seg}-${rid()}`;
}

const subtotal = (p: Plan) => p.items.reduce((s, i) => s + i.price * i.qty, 0);
const priceAt = (p: Plan, d: number) => Math.round((subtotal(p) * (100 - d)) / 100);

function buildLane(negId: string, key: string, needs: Record<string, string> | undefined): { msgs: NegotiationMessage[]; offers: Extract<A2APayload, { type: "OFFER" }>[] } {
  const p = PLANS[key];
  const b = ALL_MOCK_BUSINESSES.find((x) => x.id === key)!;
  const need = needs?.[key] ?? p.need;
  const items: OrderItem[] = p.items.map((i, n) => ({ catalogItemId: `${key}-${n}`, name: i.name, qty: i.qty, price: i.price }));
  const summary = p.items.map((i) => `${i.name} x${i.qty}`).join(", ");
  const mk = (n: number, round: number, from: "personal" | "business", text: string, payload: A2APayload): NegotiationMessage => ({
    id: `${negId}-${key}-${n}`,
    negotiationId: negId,
    fromAgent: from,
    businessId: key,
    round,
    text,
    payload,
    createdAt: "",
  });
  const offer = (d: number, text: string, n: number, round: number) => {
    const payload: Extract<A2APayload, { type: "OFFER" }> = { type: "OFFER", items, price: priceAt(p, d), discountPct: d, validUntil: "" };
    return { m: mk(n, round, "business", text, payload), payload };
  };
  const o1 = offer(p.offers[0], `Vaalaykum assalom! Mavjud: ${summary}. Jami ${formatSom(priceAt(p, p.offers[0]))}.`, 1, 1);
  const o2 = offer(p.offers[1], `${p.offers[1]}% chegirma beraman: ${formatSom(priceAt(p, p.offers[1]))}.`, 3, 2);
  const o3 = offer(p.offers[2], `Maksimal imkonim ${p.offers[2]}%: ${formatSom(priceAt(p, p.offers[2]))}. Bu ${b.name} uchun so'nggi taklif.`, 5, 3);
  const msgs: NegotiationMessage[] = [
    mk(0, 1, "personal", `Assalomu alaykum! Men mijozning shaxsiy agentiman. So'rov: ${need}`, { type: "REQUEST", taskId: "t1", need }),
    o1.m,
    mk(2, 2, "personal", `Mijoz byudjeti cheklangan. ${p.asks[0]}% chegirma bera olasizmi?`, { type: "COUNTER", askDiscountPct: p.asks[0], reason: "byudjet cheklangan" }),
    o2.m,
    mk(4, 3, "personal", `Boshqa takliflar yaxshiroq. ${p.asks[1]}% bo'lsa darhol kelishamiz.`, { type: "COUNTER", askDiscountPct: p.asks[1], reason: "raqobatchi narxi" }),
    o3.m,
    mk(6, 3, "personal", "Rozi, shu shartlarga kelishdik. Taklifni mijozga tasdiqlash uchun yuboraman.", { type: "ACCEPT" }),
  ];
  return { msgs, offers: [o1.payload, o2.payload, o3.payload] };
}

/** Skriptli parallel muzokara. Qaytargani: bekor qilish. */
export function runMockStream(negId: string, needs: Record<string, string> | undefined, emit: (e: NegotiationEvent) => void, gapMs = 330): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  const keys = laneKeys(negId);
  at(100, () => emit({ type: "status", status: "running" }));
  let last = 0;
  keys.forEach((key, li) => {
    const { msgs } = buildLane(negId, key, needs);
    const b = ALL_MOCK_BUSINESSES.find((x) => x.id === key)!;
    msgs.forEach((m, i) => {
      const t = 250 + li * 140 + i * gapMs;
      last = Math.max(last, t);
      at(t, () => {
        const now = new Date();
        const msg = { ...m, createdAt: now.toISOString() };
        if (msg.payload.type === "OFFER") msg.payload = { ...msg.payload, validUntil: new Date(now.getTime() + 3600_000).toISOString() };
        emit({ type: "message", message: msg });
        if (msg.payload.type === "OFFER") {
          const offer = msg.payload;
          emit({ type: "best_offer", businessId: key, businessName: b.name, offer });
        }
      });
    });
  });
  at(last + 200, () => emit({ type: "status", status: "agreed" }));
  return () => timers.forEach(clearTimeout);
}

export function mockConfirm(): ConfirmResult {
  const orderId = `demo-ord-${rid()}`;
  return { orderId, paymentLink: `/pay/${orderId}` };
}

/* ---------- Shaxsiy agent rejasi ---------- */

const RULES: { category: BusinessCategory; re: RegExp }[] = [
  { category: "restaurant", re: /osh|restoran|ovqat|stol|joy band|kafe|ziyofat/i },
  { category: "autoservice", re: /mashina|moy|servis|avto|cobalt|kobalt|nexia|tormoz|diagnostika/i },
  { category: "shop", re: /do'kon|oziq|guruch|yog'|shakar|mahsulot|yetkaz/i },
];
const DAY = /ertaga|bugun|shanba|yakshanba|dushanba|seshanba|chorshanba|payshanba|juma/i;

function whenISO(text: string): string | undefined {
  const time = /(\d{1,2})[:.](\d{2})/.exec(text);
  const day = DAY.exec(text)?.[0]?.toLowerCase();
  if (!day && !time) return undefined;
  const d = new Date();
  if (day === "ertaga") d.setDate(d.getDate() + 1);
  const [h, m] = time ? [Number(time[1]), Number(time[2])] : [/kechqurun|kech/i.test(text) ? 19 : 12, 0];
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function mockAgentRequest(text: string): AgentRequestResult {
  const parts = text.split(/[,;\n]|\bva\b|\bhamda\b|\+/i).map((s) => s.trim()).filter(Boolean);
  const tasks: NegotiationTask[] = [];
  parts.forEach((part, i) => {
    const rule = RULES.find((r) => r.re.test(part));
    if (!rule || tasks.some((t) => t.category === rule.category)) return;
    const people = /(\d+)\s*kishi/i.exec(part)?.[1] ?? /(\d+)\s*kishi/i.exec(text)?.[1];
    const budget = /(\d+)\s*(ming|k)\b/i.exec(part);
    tasks.push({
      taskId: `t${i + 1}`,
      category: rule.category,
      need: part.charAt(0).toUpperCase() + part.slice(1) + ".",
      when: whenISO(part) ?? whenISO(text),
      where: "Toshkent",
      people: people ? Number(people) : undefined,
      budget: budget ? Number(budget[1]) * 1000 : undefined,
    });
  });
  return { negotiationId: negotiationIdFor(tasks), tasks };
}

/* ---------- Biznes, katalog, buyurtma, analitika ---------- */

export const mockBusinesses = () => ALL_MOCK_BUSINESSES;

export function mockCreateBusiness(dto: CreateBusinessDto): Business {
  const now = new Date().toISOString();
  return { ...dto, id: `demo-${rid()}`, ownerUserId: "demo-owner", isDemo: true, createdAt: now, updatedAt: now };
}

/** Jonli API id'lari -> mock id'lari (demo rejimda ham biz-osh ishlasin) */
export const ALIAS: Record<string, string> = { "biz-osh": "chorsu", "biz-auto": "chilonzor", "biz-shop": "malika" };
const canon = (id: string) => ALIAS[id] ?? id;

export const mockImport = (rows: CatalogRowInput[]): CatalogImportResult => ({ imported: rows.length, skipped: 0, errors: [] });

export function mockOrders(rawId: string): Order[] {
  const businessId = canon(rawId);
  const it = (name: string, qty: number, price: number): OrderItem => ({ catalogItemId: `${businessId}-${name}`, name, qty, price });
  const sets: Record<string, [OrderItem[], number, number, Order["status"], number][]> = {
    chorsu: [
      [[it("To'y oshi", 6, 45000), it("Tandir non", 6, 4000)], 320160, 8, "pending_confirm", 12],
      [[it("Qo'y go'shti kabobi", 10, 18000), it("Salat", 4, 12000)], 228000, 0, "paid", 55],
      [[it("To'y oshi", 3, 45000)], 135000, 0, "confirmed", 90],
      [[it("To'y oshi", 12, 45000)], 540000, 10, "paid", 400],
      [[it("To'y oshi", 2, 45000)], 90000, 0, "cancelled", 720],
    ],
    chilonzor: [
      [[it("Moy almashtirish", 1, 120000), it("Moy filtri", 1, 45000), it("Diagnostika", 1, 80000)], 220500, 10, "pending_confirm", 20],
      [[it("Tormoz kolodkasi", 1, 180000)], 180000, 0, "paid", 130],
      [[it("Balansirovka", 1, 100000)], 100000, 0, "confirmed", 5],
    ],
    malika: [
      [[it("Lazer guruch 5 kg", 2, 85000), it("Yog' 5 l", 1, 78000)], 371450, 5, "pending_confirm", 30],
      [[it("Guruch", 1, 85000), it("Yog'", 1, 78000)], 163000, 0, "paid", 95],
      [[it("Choy", 3, 22000), it("Shakar", 2, 28000)], 122000, 0, "draft", 11],
    ],
  };
  return (sets[businessId] ?? sets.chorsu).map(([items, total, discountPct, status, ago], i) => ({
    id: `ord-${businessId}-${i}`.padEnd(12, "0"),
    businessId,
    userId: `user-${businessId}-${i}-${rid()}`,
    items,
    total,
    discountPct,
    status,
    createdAt: iso(ago),
    updatedAt: iso(ago),
  }));
}

export function mockAnalytics(rawId: string): Analytics {
  const businessId = canon(rawId);
  const sets: Record<string, Analytics> = {
    chorsu: {
      topRequests: [{ query: "Stol band qilish (guruh)", count: 42 }, { query: "Osh narxi", count: 31 }, { query: "Olib ketish", count: 19 }],
      notFound: [{ query: "Halol sertifikat nusxasi", count: 7 }, { query: "Bolalar menyusi", count: 5 }, { query: "Vegetarian taom", count: 3 }],
      lostCustomers: [{ userId: "u1", name: "Nodir (guruh 10 kishi)", lastOrderAt: iso(300) }, { userId: "u2", name: "Shahlo", lastOrderAt: iso(900) }],
      revenue: { today: 683160, week: 4120000, month: 15800000 },
    },
    chilonzor: {
      topRequests: [{ query: "Moy almashtirish narxi", count: 38 }, { query: "Diagnostika", count: 27 }, { query: "Tormoz kolodkasi", count: 15 }],
      notFound: [{ query: "Konditsioner to'ldirish", count: 9 }, { query: "Kuzov ta'miri", count: 6 }],
      lostCustomers: [{ userId: "u3", name: "Ulug'bek", lastOrderAt: iso(500) }],
      revenue: { today: 400500, week: 2650000, month: 9300000 },
    },
    malika: {
      topRequests: [{ query: "Yog' narxi", count: 33 }, { query: "Yetkazib berish", count: 29 }, { query: "Guruch navlari", count: 14 }],
      notFound: [{ query: "Go'sht mahsulotlari", count: 11 }, { query: "Sut mahsulotlari", count: 8 }],
      lostCustomers: [{ userId: "u4", name: "Feruza", lastOrderAt: iso(200) }],
      revenue: { today: 534450, week: 3300000, month: 12100000 },
    },
  };
  return sets[businessId] ?? sets.chorsu;
}

/* ---------- Inbox ---------- */

const chatMode = new Map<string, ChatMode>();

export function mockChats(rawId: string): Chat[] {
  const businessId = canon(rawId);
  const rows: [string, string, ChatMode, boolean, number, number][] = [
    ["Aziz R.", "Ertaga 6 kishilik stol bormi?", "copilot", false, 6, 2],
    ["Nodira S.", "Chegirma qilsangiz 10 kishi kelamiz", "copilot", false, 21, 1],
    ["Bekzod (yetkazib beruvchi)", "Guruch narxi oshdi, yangi narx bilan kelishamizmi?", "copilot", true, 44, 1],
    ["Dilnoza K.", "Kabobni olib ketsa bo'ladimi?", "autopilot", false, 80, 0],
    ["Sardor M.", "Rahmat!", "off", false, 300, 0],
  ];
  return rows.map(([title, lastMessageText, mode, needsHuman, ago, unread], i) => {
    const id = `chat-${businessId}-${i}`;
    return { id, tgAccountId: "tg-demo", peerId: `${1000 + i}`, title, mode: chatMode.get(id) ?? mode, lastMessageAt: iso(ago), lastMessageText, needsHuman, unread };
  });
}

export function mockSetMode(chatId: string, mode: ChatMode): { mode: ChatMode } {
  chatMode.set(chatId, mode);
  return { mode };
}

export function mockMessages(chatId: string): InboxMessage[] {
  const i = Number(chatId.split("-").pop());
  const m = (n: number, author: InboxMessage["author"], text: string, ago: number, extra: Partial<InboxMessage> = {}): InboxMessage => ({
    id: `${chatId}-m${n}`,
    chatId,
    direction: author === "customer" ? "in" : "out",
    author,
    text,
    sentAt: iso(ago),
    ...extra,
  });
  const sets: InboxMessage[][] = [
    [
      m(0, "customer", "Assalomu alaykum", 9),
      m(1, "ai", "Vaalaykum assalom! Qanday yordam bera olaman?", 8),
      m(2, "customer", "Ertaga 6 kishilik stol bormi?", 6, { voiceUrl: "#", transcript: "Ertaga olti kishilik stol bormi, soat yettiga" }),
      m(3, "ai", "Ha, ertaga 19:00 ga 6 kishilik yopiq zal bor. To'y oshi bilan taxminan 348 000 so'm. Band qilaymi?", 5, { isDraft: true }),
    ],
    [
      m(0, "customer", "Chegirma qilsangiz 10 kishi kelamiz", 21),
      m(1, "ai", "Ajoyib! 10 kishilik guruhga 8% gacha chegirma bera olaman. Kun va vaqtni ayting.", 20, { isDraft: true }),
    ],
    [
      m(0, "customer", "Guruch narxi oshdi, yangi narx bilan kelishamizmi?", 44),
      m(1, "ai", "Bu savol narx siyosatiga tegishli. Egasiga yo'naltiraman.", 43, { isDraft: true }),
    ],
    [m(0, "customer", "Kabobni olib ketsa bo'ladimi?", 82), m(1, "ai", "Albatta, olib ketish mumkin. 15 daqiqada tayyor bo'ladi.", 80)],
    [m(0, "customer", "Rahmat!", 301), m(1, "owner", "Marhamat!", 300)],
  ];
  return sets[i] ?? sets[0];
}

/* ---------- Loop (o'z-o'zini yaxshilash) ---------- */

export function mockLoop(rawId: string): LoopProposal[] {
  const businessId = canon(rawId);
  const base = { businessId, status: "pending" as const, createdAt: new Date().toISOString() };
  return [
    { ...base, id: `p1-${rid()}`, kind: "catalog_item", title: "Katalogga \"Bolalar menyusi\" qo'shish", diff: "+ Bolalar menyusi: sho'rva, kotlet, kompot (35 000 so'm)\n+ tags: [bolalar, menyu]", reason: "So'nggi 7 kunda 5 marta so'ralgan, katalogda topilmagan", evalBefore: 72, evalAfter: 81 },
    { ...base, id: `p2-${rid()}`, kind: "prompt_fix", title: "Guruh chegirmasini aniq aytish", diff: "- 'Chegirma bor' deb javob beradi\n+ 6+ kishi guruhga chegirma chegarasini narx bilan aytadi", reason: "2 ta katta guruh chegirma noaniqligi sababli qaytmagan", evalBefore: 72, evalAfter: 78 },
    { ...base, id: `p3-${rid()}`, kind: "faq", title: "FAQ: ish vaqti va manzil", diff: "+ Q: Soat nechagacha ochiqsiz?\n+ A: Har kuni 09:00-22:00.", reason: "\"Soat nechagacha?\" savoli 9 marta takrorlangan", evalBefore: 72, evalAfter: 75 },
  ];
}

export function mockFacts(rawId: string): MemoryFact[] {
  const businessId = canon(rawId);
  return [
    ["Mijozlar ko'pincha 19:00 dan keyin stol so'raydi", "Suhbatlar tahlili", 0.86],
    ["Juma kuni guruh buyurtmalari 2 barobar ko'p", "Buyurtmalar tarixi", 0.9],
    ["Aziz R. doimiy mijoz, odatda 6 kishi bilan keladi", "Suhbat #1", 0.78],
    ["Egasi: choynak sovg'a qilish pul chegirmasidan arzonroq", "Egasi ko'rsatmasi", 0.95],
  ].map(([fact, source, confidence], i) => ({
    id: `f${i}`,
    subjectType: i === 2 ? "customer" : "business",
    subjectId: businessId,
    fact: fact as string,
    source: source as string,
    confidence: confidence as number,
    createdAt: iso(60 * (i + 1) * 5),
  }));
}

export * from "./mock-account";
