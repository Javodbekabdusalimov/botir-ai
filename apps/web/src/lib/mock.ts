// Demo rejim: backend yo'q bo'lganda yoki NEXT_PUBLIC_DEMO=1 da ishlaydigan realistik stsenariylar.
import type {
  AcceptResult,
  AgentMessage,
  Analytics,
  AssistantTask,
  Business,
  BusinessInput,
  ChatReply,
  ConversationItem,
  NegotiationEvent,
  NegotiationSession,
  Offer,
  Order,
  Product,
} from "./types";

export const DEMO_BUSINESSES: Business[] = [
  { id: "chorsu", name: "Chorsu Osh Markazi", category: "restaurant", area: "Chorsu, Shayxontohur", maxDiscountPct: 10 },
  { id: "chilonzor", name: "Chilonzor AutoServis", category: "autoservice", area: "Chilonzor, 9-kvartal", maxDiscountPct: 12 },
  { id: "malika", name: "Malika Do'kon", category: "shop", area: "Yunusobod, 4-kvartal", maxDiscountPct: 7 },
];

const p = (businessId: string, id: string, name: string, price: number, unit: string): Product => ({
  id: `${businessId}-${id}`,
  businessId,
  name,
  price,
  unit,
});

export const DEMO_PRODUCTS: Record<string, Product[]> = {
  chorsu: [
    p("chorsu", "osh", "To'y oshi", 45000, "porsiya"),
    p("chorsu", "non", "Tandir non", 4000, "dona"),
    p("chorsu", "choy", "Ko'k choy (choynak)", 15000, "dona"),
    p("chorsu", "salat", "Achchiq-chuchuk salat", 12000, "porsiya"),
    p("chorsu", "kabob", "Qo'y go'shti kabobi", 18000, "shish"),
  ],
  chilonzor: [
    p("chilonzor", "moy", "Dvigatel moyini almashtirish (ish haqi)", 120000, "xizmat"),
    p("chilonzor", "filtr", "Moy filtri", 45000, "dona"),
    p("chilonzor", "diag", "Kompyuter diagnostikasi", 80000, "xizmat"),
    p("chilonzor", "balans", "G'ildirak balansirovkasi (4 ta)", 100000, "xizmat"),
    p("chilonzor", "kolodka", "Tormoz kolodkasini almashtirish", 180000, "xizmat"),
  ],
  malika: [
    p("malika", "guruch", "Lazer guruch 5 kg", 85000, "qop"),
    p("malika", "yog", "Kungaboqar yog'i 5 l", 78000, "dona"),
    p("malika", "shakar", "Shakar 2 kg", 28000, "paket"),
    p("malika", "un", "Un oliy navli 10 kg", 65000, "qop"),
    p("malika", "choy", "Ahmad choy 100 g", 22000, "quti"),
  ],
};

interface Scenario {
  defaultRequest: string;
  qty: Record<string, number>; // product suffix -> qty
  discountPct: number;
  script: { role: "personal_agent" | "biz_agent"; text: (req: string) => string }[];
}

export const SCENARIOS: Record<string, Scenario> = {
  chorsu: {
    defaultRequest: "Ertaga kechqurun soat 19:00 ga 6 kishilik osh joy kerak, byudjet 300 ming atrofida.",
    qty: { osh: 6, non: 6, choy: 2, salat: 2 },
    discountPct: 8,
    script: [
      { role: "personal_agent", text: (r) => `Assalomu alaykum! Men mijozning shaxsiy agentiman. So'rov: "${r}" Stol bo'shmi?` },
      { role: "biz_agent", text: () => "Vaalaykum assalom! Ertaga 19:00 ga 6 kishilik stol bor, yopiq zal. To'y oshi, non, choy va salat bilan jami 348 000 so'm bo'ladi." },
      { role: "personal_agent", text: () => "Mijoz byudjeti 300 000 so'm atrofida. Guruh 6 kishi, shuning uchun chegirma bera olasizmi?" },
      { role: "biz_agent", text: () => "6 kishilik guruhga 5% chegirma beraman: 330 600 so'm." },
      { role: "personal_agent", text: () => "Chilonzordagi oshxona 10% ga rozi bo'lgan. 10% qila olsangiz, mijoz aynan sizni tanlaydi." },
      { role: "biz_agent", text: () => "10% ga ruxsatim yo'q. Maksimal 8%: 320 160 so'm, ustiga bepul choynak qo'shaman. Shu so'nggi taklif, taklif tayyor." },
    ],
  },
  chilonzor: {
    defaultRequest: "Cobalt mashinam uchun moy almashtirish va kompyuter diagnostikasi, shanba kuni ertalab.",
    qty: { moy: 1, filtr: 1, diag: 1 },
    discountPct: 10,
    script: [
      { role: "personal_agent", text: (r) => `Assalomu alaykum! Mijoz nomidan yozyapman. So'rov: "${r}" Shanba kuni joy bormi?` },
      { role: "biz_agent", text: () => "Salom! Shanba 10:00 da bo'sh slot bor. Moy almashtirish, filtr va diagnostika jami 245 000 so'm." },
      { role: "personal_agent", text: () => "Mijoz doimiy xizmatga keladi, shuning uchun qo'shimcha chegirma so'rayman. Diagnostika bepul bo'la oladimi?" },
      { role: "biz_agent", text: () => "Diagnostikani bepul qilolmayman, lekin umumiy summaga 6% chegirma beraman: 230 300 so'm." },
      { role: "personal_agent", text: () => "Raqobatchi servis 215 000 so'm aytdi. 10% chegirma bo'lsa shu yerda qoladi." },
      { role: "biz_agent", text: () => "10% beraman: 220 500 so'm. Moy sifati va 1 oy kafolat o'sha narxga kiradi. Taklif tayyor." },
    ],
  },
  malika: {
    defaultRequest: "Oylik oziq-ovqat to'plami: guruch, yog', shakar, un va choy. Bugun yetkazib bering.",
    qty: { guruch: 2, yog: 1, shakar: 2, un: 1, choy: 1 },
    discountPct: 5,
    script: [
      { role: "personal_agent", text: (r) => `Assalomu alaykum! Mijozning shaxsiy agentiman. So'rov: "${r}" Hammasi omborda bormi?` },
      { role: "biz_agent", text: () => "Vaalaykum assalom! Hammasi mavjud. Guruch 2 qop, yog', shakar 2 paket, un va choy: jami 391 000 so'm. Yetkazish bugun 18:00 gacha." },
      { role: "personal_agent", text: () => "Mijoz har oy shu hajmda oladi. Doimiy xaridor chegirmasi bormi?" },
      { role: "biz_agent", text: () => "Doimiy mijozga 3% beraman: 379 270 so'm." },
      { role: "personal_agent", text: () => "Yetkazib berish bepul bo'lsa va 5% ga yetkazsangiz, har oy shu yerdan olamiz." },
      { role: "biz_agent", text: () => "Maksimal chegirmam 7%, 5% ni tasdiqlayman: 371 450 so'm, yetkazish bepul. Taklif tayyor." },
    ],
  },
};

export function scenarioKey(id: string): string {
  const m = /^demo-(chorsu|chilonzor|malika)/.exec(id);
  return m ? m[1] : "chorsu";
}

export function buildOffer(sessionId: string, key: string): Offer {
  const sc = SCENARIOS[key];
  const products = DEMO_PRODUCTS[key];
  const items = Object.entries(sc.qty).map(([suffix, qty]) => ({ productId: `${key}-${suffix}`, qty }));
  const subtotal = items.reduce((s, it) => s + (products.find((x) => x.id === it.productId)?.price ?? 0) * it.qty, 0);
  return {
    id: `offer-${sessionId}`,
    sessionId,
    items,
    total: Math.round((subtotal * (100 - sc.discountPct)) / 100),
    discountPct: sc.discountPct,
    status: "proposed",
  };
}

/** Skriptli muzokarani vaqt bo'yicha yuboradi; qaytargani: bekor qilish. */
export function runMockStream(
  sessionId: string,
  request: string | undefined,
  emit: (e: NegotiationEvent) => void,
  gapMs = 350,
): () => void {
  const key = scenarioKey(sessionId);
  const sc = SCENARIOS[key];
  const req = request || sc.defaultRequest;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const events: NegotiationEvent[] = [{ type: "status", status: "running" }];
  sc.script.forEach((step, i) => {
    const message: AgentMessage = {
      id: `${sessionId}-m${i}`,
      role: step.role,
      text: step.text(req),
      at: "", // yuborish vaqtida to'ldiriladi
    };
    events.push({ type: "message", message });
  });
  events.push({ type: "offer", offer: buildOffer(sessionId, key) });
  events.push({ type: "status", status: "agreed" });
  events.forEach((ev, i) => {
    timers.push(
      setTimeout(() => {
        if (ev.type === "message") emit({ ...ev, message: { ...ev.message, at: new Date().toISOString() } });
        else emit(ev);
      }, 200 + i * gapMs),
    );
  });
  return () => timers.forEach(clearTimeout);
}

/* ---------- Assistant (shaxsiy agent rejasi) ---------- */

const CATEGORY_RULES: { category: Business["category"]; re: RegExp; businessId: string; title: string }[] = [
  { category: "restaurant", re: /osh|restoran|ovqat|stol|joy band|kafe|ziyofat/i, businessId: "chorsu", title: "Stol band qilish" },
  { category: "autoservice", re: /mashina|moy|servis|avto|cobalt|kobalt|nexia|tormoz|diagnostika/i, businessId: "chilonzor", title: "Avtoservisga yozilish" },
  { category: "shop", re: /do'kon|oziq|guruch|yog'|shakar|mahsulot|yetkaz/i, businessId: "malika", title: "Mahsulot buyurtmasi" },
];

export function mockParseAssistant(text: string): AssistantTask[] {
  const parts = text
    .split(/[,;\n]|\bva\b|\bhamda\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const tasks: AssistantTask[] = [];
  const global = /ertaga|bugun|shanba|yakshanba|dushanba|seshanba|chorshanba|payshanba|juma/i.exec(text)?.[0];
  parts.forEach((part, i) => {
    const rule = CATEGORY_RULES.find((r) => r.re.test(part));
    if (!rule) return;
    if (tasks.some((t) => t.businessId === rule.businessId)) return;
    const biz = DEMO_BUSINESSES.find((b) => b.id === rule.businessId)!;
    const people = /(\d+)\s*kishi/i.exec(part)?.[1] ?? /(\d+)\s*kishi/i.exec(text)?.[1];
    const time = /(\d{1,2})[:.](\d{2})/.exec(part)?.[0];
    const day = /ertaga|bugun|shanba|yakshanba|dushanba|seshanba|chorshanba|payshanba|juma/i.exec(part)?.[0] ?? global;
    const when = [day && day[0].toUpperCase() + day.slice(1).toLowerCase(), time].filter(Boolean).join(", ") || undefined;
    tasks.push({
      id: `task-${i}-${rule.businessId}`,
      title: rule.title,
      category: rule.category,
      area: biz.area,
      when,
      people: people ? Number(people) : undefined,
      businessId: biz.id,
      businessName: biz.name,
      request: part.charAt(0).toUpperCase() + part.slice(1) + (part.endsWith(".") ? "" : "."),
    });
  });
  return tasks;
}

/* ---------- Biznes, buyurtmalar, analitika ---------- */

const mkId = () => Math.random().toString(36).slice(2, 8);

export function mockCreateBusiness(input: BusinessInput): Business {
  return {
    id: `demo-${mkId()}`,
    name: input.name,
    category: input.category,
    area: input.area,
    maxDiscountPct: input.maxDiscountPct,
  };
}

export function mockChat(businessId: string, text: string): ChatReply {
  const products = DEMO_PRODUCTS[businessId] ?? DEMO_PRODUCTS.chorsu;
  const t = text.toLowerCase();
  const hit = products.find((x) => x.name.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w.slice(0, 4))));
  if (hit) return { reply: `Ha, "${hit.name}" bor: ${hit.price.toLocaleString("en-US").replace(/,/g, " ")} so'm / ${hit.unit}. Buyurtma beraylikmi?` };
  if (/soat|vaqt|ochiq|ish vaqti/.test(t)) return { reply: "Har kuni 09:00 dan 22:00 gacha ochiqmiz." };
  if (/chegirma|arzon|skidka/.test(t)) return { reply: "Doimiy mijozlar va katta buyurtmalarga chegirma bor. Hajmini ayting, hisoblab beraman." };
  return { reply: "Tushundim. Aniqroq ayting: nima kerak, qachonga va nechta? Katalogdan tanlab beraman." };
}

export function mockAccept(offerId: string): AcceptResult {
  const sessionId = offerId.replace(/^offer-/, "");
  const key = scenarioKey(sessionId);
  const offer = { ...buildOffer(sessionId, key), status: "accepted" as const };
  const biz = DEMO_BUSINESSES.find((b) => b.id === key)!;
  return {
    offer,
    payUrl: `https://pay.botir.uz/demo/${offerId}`,
    order: {
      id: `ord-${mkId()}`,
      businessId: biz.id,
      customer: "Siz",
      summary: `${offer.items.length} ta pozitsiya, chegirma ${offer.discountPct}%`,
      total: offer.total,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    },
  };
}

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

export function mockOrders(businessId: string): Order[] {
  const sets: Record<string, [string, string, number, Order["status"], number][]> = {
    chorsu: [
      ["Aziz R.", "6 kishilik stol, to'y oshi x6, non x6", 320160, "confirmed", 12],
      ["Dilnoza K.", "Kabob x10, salat x4, choy x2", 247000, "paid", 55],
      ["Sardor M.", "Osh x3 (olib ketish)", 135000, "new", 8],
      ["Jasur T.", "12 kishilik stol, tug'ilgan kun", 612000, "done", 400],
      ["Madina A.", "Osh x2, non x2", 98000, "cancelled", 720],
    ],
    chilonzor: [
      ["Bobur S.", "Moy + filtr + diagnostika, Cobalt", 220500, "confirmed", 20],
      ["Otabek N.", "Tormoz kolodkasi, Nexia 2", 180000, "paid", 130],
      ["Kamola Y.", "Balansirovka 4 g'ildirak", 100000, "new", 5],
      ["Rustam H.", "Diagnostika, Gentra", 80000, "done", 900],
    ],
    malika: [
      ["Gulnora Q.", "Oylik to'plam (5 pozitsiya)", 371450, "confirmed", 30],
      ["Anvar B.", "Guruch 1, yog' 1", 163000, "paid", 95],
      ["Zarina I.", "Choy x3, shakar x2", 122000, "new", 11],
    ],
  };
  const rows = sets[businessId] ?? sets.chorsu;
  return rows.map(([customer, summary, total, status, ago], i) => ({
    id: `ord-${businessId}-${i}`,
    businessId,
    customer,
    summary,
    total,
    status,
    createdAt: iso(ago),
  }));
}

export function mockConversations(businessId: string): ConversationItem[] {
  const sets: Record<string, [ConversationItem["channel"], string, string, number][]> = {
    chorsu: [
      ["telegram", "Aziz R.", "Ertaga 6 kishilik stol bormi?", 14],
      ["web", "Mehmon", "Halol sertifikat bormi?", 40],
      ["telegram", "Dilnoza K.", "Kabobni olib ketsa bo'ladimi?", 70],
    ],
    chilonzor: [
      ["telegram", "Bobur S.", "Cobalt uchun moy narxi qancha?", 25],
      ["web", "Mehmon", "Yakshanba ishlaysizlarmi?", 90],
    ],
    malika: [
      ["telegram", "Gulnora Q.", "Bugun yetkazib berasizmi?", 33],
      ["telegram", "Zarina I.", "Un narxi oshdimi?", 120],
    ],
  };
  return (sets[businessId] ?? sets.chorsu).map(([channel, customer, lastMessage, ago], i) => ({
    id: `conv-${businessId}-${i}`,
    channel,
    customer,
    lastMessage,
    at: iso(ago),
  }));
}

export function mockAnalytics(businessId: string): Analytics {
  const sets: Record<string, Analytics> = {
    chorsu: {
      topAsked: [
        { text: "Stol band qilish (guruh)", count: 42 },
        { text: "Osh narxi", count: 31 },
        { text: "Olib ketish", count: 19 },
      ],
      missing: [
        { text: "Halol sertifikat nusxasi", count: 7 },
        { text: "Bolalar menyusi", count: 5 },
        { text: "Vegetarian taom", count: 3 },
      ],
      lostClients: [
        { name: "Nodir (guruh 10 kishi)", reason: "Chegirma 12% so'ragan, maksimal 10%", at: iso(300) },
        { name: "Shahlo", reason: "Soat 23:00 gacha ochiq emas", at: iso(900) },
      ],
    },
    chilonzor: {
      topAsked: [
        { text: "Moy almashtirish narxi", count: 38 },
        { text: "Diagnostika", count: 27 },
        { text: "Tormoz kolodkasi", count: 15 },
      ],
      missing: [
        { text: "Konditsioner to'ldirish", count: 9 },
        { text: "Kuzov ta'miri", count: 6 },
      ],
      lostClients: [{ name: "Ulug'bek", reason: "Yakshanba ish kuni emas", at: iso(500) }],
    },
    malika: {
      topAsked: [
        { text: "Yog' narxi", count: 33 },
        { text: "Yetkazib berish", count: 29 },
        { text: "Guruch navlari", count: 14 },
      ],
      missing: [
        { text: "Go'sht mahsulotlari", count: 11 },
        { text: "Sut mahsulotlari", count: 8 },
      ],
      lostClients: [{ name: "Feruza", reason: "Yetkazish 18:00 dan keyin yo'q", at: iso(200) }],
    },
  };
  return sets[businessId] ?? sets.chorsu;
}

export function mockNegotiationSession(businessId: string, request: string): NegotiationSession {
  const key = DEMO_BUSINESSES.some((b) => b.id === businessId) ? businessId : "chorsu";
  const biz = DEMO_BUSINESSES.find((b) => b.id === key)!;
  return {
    id: `demo-${key}-${mkId()}`,
    businessId: key,
    businessName: biz.name,
    request,
    status: "running",
    round: 0,
    createdAt: new Date().toISOString(),
  };
}

/* ---------- Telegram ulash / inbox / yaxshilash (demo) ---------- */
import type { ImproveData, InboxItem, Suggestion } from "./types";

export function mockInbox(businessId: string): InboxItem[] {
  const rows: [string, InboxItem["channel"], string, string, InboxItem["mode"], InboxItem["status"], number][] = [
    ["Aziz R.", "telegram", "Ertaga 6 kishilik stol bormi?", "Ha, ertaga 19:00 ga 6 kishilik yopiq zal bor. To'y oshi bilan taxminan 348 000 so'm. Band qilaymi?", "copilot", "draft", 6],
    ["Nodira S.", "telegram", "Chegirma qilsangiz 10 kishi kelamiz", "Ajoyib! 10 kishilik guruhga 8% gacha chegirma bera olaman. Kun va vaqtni ayting.", "copilot", "draft", 21],
    ["Mehmon (web)", "web", "Halol sertifikatingiz bormi?", "Bu savolga aniq javob bazamda yo'q. Egasiga yo'naltiraman.", "copilot", "needs_human", 44],
    ["Dilnoza K.", "telegram", "Kabobni olib ketsa bo'ladimi?", "Albatta, olib ketish mumkin. 15 daqiqada tayyor bo'ladi.", "autopilot", "sent", 80],
  ];
  return rows.map(([customer, channel, lastMessage, draft, mode, status, ago], i) => ({
    id: `inb-${businessId}-${i}`,
    customer,
    channel,
    lastMessage,
    draft,
    mode,
    status,
    at: iso(ago),
  }));
}

export function mockImprove(): ImproveData {
  const suggestions: Suggestion[] = [
    { id: "s1", title: "Katalogga \"Bolalar menyusi\" qo'shish", reason: "So'nggi 7 kunda 5 marta so'ralgan, katalogda yo'q", status: "proposed" },
    { id: "s2", title: "Guruhga chegirma chegarasini 10% dan 12% ga oshirish", reason: "2 ta katta guruh (10+ kishi) chegirma sababli qaytmagan", status: "proposed" },
    { id: "s3", title: "Javoblarga ish vaqtini avtomatik qo'shish", reason: "\"Soat nechagacha?\" savoli 9 marta takrorlangan", status: "proposed" },
  ];
  const facts = [
    ["Mijozlar ko'pincha 19:00 dan keyin stol so'raydi", "Suhbatlar tahlili"],
    ["Juma kuni guruh buyurtmalari 2 barobar ko'p", "Buyurtmalar tarixi"],
    ["\"Osh\" so'zi bor savollarning 60% i narx haqida", "Suhbatlar tahlili"],
    ["Egasi: choynak sovg'a qilish mumkin, pul chegirmasidan arzonroq", "Egasi ko'rsatmasi"],
  ].map(([text, source], i) => ({ id: `f${i}`, text, source, at: iso(60 * (i + 1) * 5) }));
  return { suggestions, facts };
}
