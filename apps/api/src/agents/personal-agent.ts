import type { LlmClient } from './llm/llm-client';
import type { AgentLogger } from './logger';
import { silentLogger } from './logger';
import type { AgentMessage, Offer } from './shared';
import type { AgentStore } from './store/agent-store';
import type { Lang } from './business-agent';
import { langRule, renderHistory, tashkentNow } from './business-agent';
import { canonicalDistrict, districtsIn } from '../outreach/districts';
import type { AgentBusiness, BusinessCategory, Product, TaskItem, UserTask } from './types';

/** Every shared category with a parser hint. Record → typecheck fails if the contract gains a category the parser does not know. */
const CATEGORY_HINTS: Record<BusinessCategory, string> = {
  restaurant: 'restoran, kafe, osh, ovqat, joy/stol band qilish',
  shop: "do'kon, oziq-ovqat, mahsulot sotib olish",
  autoservice: 'avtoservis, moy almashtirish, diagnostika',
  clinic: 'klinika, shifokor, tahlil',
  beauty: "go'zallik saloni: soch olish, manikyur, kosmetolog",
  other: "boshqa xizmat (yuqoridagilarning hech biriga to'g'ri kelmasa)",
};
const CATEGORIES = Object.keys(CATEGORY_HINTS) as BusinessCategory[];
const MAX_INT = 2_000_000_000; // fits the Prisma Int column
const HHMM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export type PersonalDecision =
  | { action: 'accept'; message: string }
  | { action: 'reject'; message: string }
  | { action: 'counter'; message: string };

/** What the offer misses against the client's hard conditions. Empty = ok. */
export interface UnmetConditions {
  overBudget: boolean;
  missing: TaskItem[];
}

type RawTask = { [K in keyof UserTask]?: unknown };

export class PersonalAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
    private readonly logger: AgentLogger = silentLogger,
  ) {}

  /** User text → tasks (haiku, JSON). Every field is validated in code; a missing or unclear value stays undefined. */
  async parse(text: string, memoryContext = '', district?: string): Promise<UserTask[]> {
    const { data } = await this.llm.completeJson<{ tasks?: RawTask[] }>({
      model: 'haiku',
      purpose: 'parser',
      system: [
        "Sen foydalanuvchi gapini vazifalarga ajratuvchi parser'san.",
        tashkentNow(),
        `category faqat:\n${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join('\n')}`,
        "Bir joydan bir vaqtda olinadigan narsalar (masalan \"osh va 2 ta salat\") — BITTA vazifa, items ichida.",
        "Boshqa vaqt yoki boshqa xizmat — alohida vazifa; bir kategoriyadagi ikki so'rov ham (masalan \"13:00 ga 6 kishiga va 19:00 ga 8 kishiga stol\") IKKI vazifa, birlashtirma.",
        'need — qisqa o\'zbekcha (lotin), FAQAT mijoz so\'ragan narsa (masalan "osh", "moy almashtirish"); "joy band qilish" — faqat mijoz joy/stol band qilishni o\'zi so\'rasa.',
        'items — mijoz aniq so\'ragan mahsulot/xizmatlar: name — o\'zbek lotin, bosh shaklda ("osh", "suv", "moy almashtirish");',
        'qty — FAQAT matnda son aniq aytilsa ("6 porsiya osh" → 6, "2 kg guruch" → 2, "3 ta non" → 3), aks holda qty yozma. "6 kishilik" — bu people, qty emas.',
        'when — matndagi vaqt/sana iborasi aynan (masalan "ertaga 18:00"). people — FAQAT "N kishi/kishilik/odam" deyilsa (porsiya soni people emas). area — tuman nomi.',
        'wishes — mijoz istak va shartlari o\'z so\'zlari bilan ("piyozsiz", "deraza yonida", "uyga yetkazib berish").',
        'maxBudget — mijoz aniq aytgan eng ko\'p summa, so\'mda butun son ("300 mingdan oshmasin" → 300000).',
        "Matnda yo'q maydonni qo'shma, taxmin qilma.",
        memoryContext ? `Mijoz haqida ma'lum faktlar (faqat tushunish uchun, ulardan maydon to'ldirma):\n${memoryContext}` : '',
        'JSON: {"tasks":[{"category":string,"need":string,"items"?:[{"name":string,"qty"?:number}],"when"?:string,"people"?:number,"wishes"?:string,"maxBudget"?:number,"area"?:string}]}',
      ].join('\n'),
      prompt: text,
    });
    // A district the text names once applies to every task that has none; the UI-chosen `district` is the last fallback.
    const named = districtsIn(text);
    const fallback = named.length === 1 ? named[0] : canonicalDistrict(district) ?? district?.trim().slice(0, 80);
    return (data.tasks ?? []).flatMap((raw) => {
      const task = toTask(raw);
      if (!task) return [];
      return !task.area && fallback ? [{ ...task, area: fallback }] : [task];
    });
  }

  /**
   * Businesses of the category with something to sell, real before demo. Only the requested area, unless nobody there matches.
   * A business with broken data (catalog that cannot be read, bad prices or hours) is skipped with a warning, never fails the category.
   */
  async findBusinesses(task: UserTask): Promise<AgentBusiness[]> {
    const found = await this.store.getBusinesses({ category: task.category });
    const usable = await Promise.all(found.map((b) => this.usable(b)));
    const all = found.filter((_, i) => usable[i]);
    const area = task.area?.trim().toLowerCase();
    // Both ways: "Chilonzor tumani" ↔ "Chilonzor".
    const matches = (district: string): boolean => Boolean(area && district && (district.includes(area) || area.includes(district)));
    const inArea = all.filter((b) => matches(b.area.trim().toLowerCase()));
    const pool = inArea.length > 0 ? inArea : all;
    return [...pool].sort((x, y) => Number(x.isDemo) - Number(y.isDemo));
  }

  /** First message to the business agent (template, no LLM — fast and predictable). The budget stays private. */
  requestText(task: UserTask, lang: Lang, memory: string[] = []): string {
    const counted = (task.items ?? []).filter((it) => it.qty).map((it) => `${it.name} × ${it.qty}`);
    const ru = lang === 'ru';
    const parts = [
      task.need,
      counted.length ? `${ru ? 'количество' : 'miqdor'}: ${counted.join(', ')}` : undefined,
      task.when,
      task.people ? `${task.people} ${ru ? 'чел.' : 'kishi'}` : undefined,
      task.wishes ? `${ru ? 'пожелания' : 'istaklar'}: ${task.wishes}` : undefined,
    ].filter(Boolean);
    const mem = memory.length
      ? ru
        ? ` Предпочтения клиента (из памяти): ${memory.join('; ')}.`
        : ` Mijozning odatlari (xotiradan): ${memory.join('; ')}.`
      : '';
    return ru
      ? `Здравствуйте! Я ассистент клиента. Нужно: ${parts.join(', ')}.${mem} Что можете предложить?`
      : `Assalomu alaykum! Men mijozning yordamchisiman. Kerak: ${parts.join(', ')}.${mem} Nima taklif qilasiz?`;
  }

  /**
   * React to a business offer: accept, politely ask for a discount, or reject.
   * Hard client conditions (budget, requested items and quantities) are checked in code first; the LLM cannot accept past them.
   */
  async decide(input: {
    task: UserTask;
    history: AgentMessage[];
    offer?: Offer;
    round: number;
    maxRounds: number;
    lang: Lang;
  }): Promise<PersonalDecision> {
    const last = input.round >= input.maxRounds;
    if (input.offer) {
      const unmet = checkClientConditions(input.task, input.offer, await this.productsOf(input.task, input.offer));
      if (unmet) return { action: last ? 'reject' : 'counter', message: unmetMessage(unmet, input.lang, last) };
    }
    const { data } = await this.llm.completeJson<{ action?: string; message?: string }>({
      model: 'sonnet',
      purpose: 'personal_agent',
      system: [
        "Sen mijozning shaxsiy AI yordamchisisan. Biznes agenti bilan mijoz nomidan muzokara qilasan va FAQAT mijoz manfaatini himoya qilasan.",
        tashkentNow(),
        // The budget is enforced in code and never revealed to the seller.
        `Mijoz vazifasi: ${JSON.stringify({ ...input.task, maxBudget: undefined })}.`,
        "Maqsad: vazifaga mos taklifni eng yaxshi narxda olish. Xushmuomala bo'l, qisqa yoz (1–2 gap).",
        "Taklif bor va hali chegirma so'ramagan bo'lsang — bir marta muloyim chegirma so'ra (action=counter).",
        "accept FAQAT taklif vazifaga to'liq mos bo'lsa: so'ralgan narsa va soni, vaqt (when) va mijoz istaklari (wishes) biznes tomonidan aniq tasdiqlangan.",
        "Biznes biror shartni bilmasa yoki \"aniqlab beraman\" desa — bu tasdiq EMAS, accept qilma.",
        "Mijoz so'ramagan narsani (choy, salat...) so'rama. Taklifga so'ralmagan pullik narsa qo'shilsa — olib tashlashni so'ra.",
        "Taklif yo'q bo'lsa — aniqlashtir (counter). Vazifani bajara olmasa — reject.",
        last ? "Bu OXIRGI raund: faqat accept yoki reject tanla. Shartlar tasdiqlanmagan bo'lsa — reject." : '',
        "Pul to'lash yoki yakuniy band qilishni sen qilmaysan — mijoz o'zi \"Tasdiqlayman\" bosadi.",
        langRule(input.lang),
        'JSON: {"action":"accept"|"counter"|"reject","message":string}',
      ].join('\n'),
      prompt: `Suhbat:\n${renderHistory(input.history)}\n\nJoriy taklif: ${
        input.offer ? JSON.stringify({ items: input.offer.items, total: input.offer.total, discountPct: input.offer.discountPct }) : "yo'q"
      }`,
    });
    const message = String(data.message ?? '').trim();
    const action = data.action === 'accept' || data.action === 'reject' || data.action === 'counter' ? data.action : 'counter';
    // Last round: a still-open counter means the client is not satisfied → reject, never a silent accept.
    if (last && action === 'counter') return { action: 'reject', message };
    return { action, message };
  }

  /** A business takes part only if its catalog loads and every price is valid, and its hours are real "HH:MM". */
  private async usable(b: AgentBusiness): Promise<boolean> {
    try {
      if (!HHMM.test(b.hours.open) || !HHMM.test(b.hours.close)) throw new Error(`bad work hours ${JSON.stringify(b.hours)}`);
      const products = await this.store.getProducts(b.id);
      const bad = products.find((p) => !isValidPrice(p.price));
      if (bad) throw new Error(`bad price ${bad.price} for ${bad.id}`);
      return products.length > 0;
    } catch (e) {
      this.logger.warn(`[personal-agent] business ${b.id} skipped: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** Catalog of the business that made the offer (only needed when the client named items). */
  private async productsOf(task: UserTask, offer: Offer): Promise<Product[]> {
    if (!task.items?.length) return [];
    for (const b of await this.store.getBusinesses({ category: task.category })) {
      const products = await this.store.getProducts(b.id).catch(() => [] as Product[]);
      if (offer.items.every((it) => products.some((p) => p.id === it.productId))) return products;
    }
    return [];
  }
}

/**
 * Deterministic client conditions, no LLM: total ≤ maxBudget, and every item the client named is in the offer
 * with at least the requested qty. Name matching is lenient on purpose (shared word or prefix): a false "missing"
 * would block a good deal, the human still confirms. null = all conditions hold.
 */
export function checkClientConditions(task: UserTask, offer: Offer, products: Product[]): UnmetConditions | null {
  const overBudget = task.maxBudget !== undefined && offer.total > task.maxBudget;
  const names = new Map(products.map((p) => [p.id, p.name]));
  const missing = (task.items ?? []).filter((item) => {
    const got = offer.items
      .filter((it) => sameThing(item.name, names.get(it.productId) ?? ''))
      .reduce((sum, it) => sum + it.qty, 0);
    return got === 0 || got < (item.qty ?? 1);
  });
  return overBudget || missing.length > 0 ? { overBudget, missing } : null;
}

function unmetMessage(unmet: UnmetConditions, lang: Lang, last: boolean): string {
  const ru = lang === 'ru';
  const parts = [
    ...unmet.missing.map((it) => (it.qty ? `${it.name} × ${it.qty}` : it.name)).map((s) => (ru ? `нет: ${s}` : `${s} yo'q`)),
    ...(unmet.overBudget ? [ru ? 'итог выше бюджета клиента' : 'jami mijoz byudjetidan oshib ketdi'] : []),
  ].join('; ');
  if (ru) return last ? `К сожалению, предложение не подходит клиенту (${parts}). Спасибо.` : `Предложение не подходит клиенту (${parts}). Можете исправить?`;
  return last ? `Afsus, taklif mijoz shartiga mos kelmadi (${parts}). Rahmat.` : `Taklif mijoz shartiga mos emas (${parts}). To'g'rilab bera olasizmi?`;
}

const words = (s: string): string[] =>
  s.toLowerCase().replace(/[ʻʼ'‘’`]/g, '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

function sameThing(asked: string, product: string): boolean {
  const pw = words(product);
  return words(asked).some((w) => pw.some((p) => p.startsWith(w) || w.startsWith(p)));
}

const isValidPrice = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= MAX_INT;

/** 6, "6", "300 000" → number; anything else (fractions, words, ≤ 0) → undefined. */
function toPositiveInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d[\d\s]*$/.test(v.trim()) ? Number(v.replace(/\s/g, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n <= MAX_INT ? n : undefined;
}

function toText(v: unknown, max: number): string | undefined {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return s || undefined;
}

function toTask(raw: RawTask): UserTask | null {
  const category = CATEGORIES.find((c) => c === raw.category);
  if (!category) return null;
  const items = Array.isArray(raw.items)
    ? raw.items.slice(0, 10).flatMap((it: { name?: unknown; qty?: unknown }) => {
        const name = toText(it?.name, 80);
        const qty = toPositiveInt(it?.qty);
        return name ? [{ name, ...(qty ? { qty } : {}) }] : [];
      })
    : [];
  const task: UserTask = {
    category,
    need: toText(raw.need, 200) ?? '',
    when: toText(raw.when, 100),
    people: toPositiveInt(raw.people),
    area: canonicalDistrict(toText(raw.area, 80)) ?? toText(raw.area, 80),
    wishes: toText(raw.wishes, 300),
    maxBudget: toPositiveInt(raw.maxBudget),
    items: items.length ? items : undefined,
  };
  // Drop absent optional fields so the task JSON stays clean.
  for (const k of Object.keys(task) as (keyof UserTask)[]) if (task[k] === undefined) delete task[k];
  return task;
}

