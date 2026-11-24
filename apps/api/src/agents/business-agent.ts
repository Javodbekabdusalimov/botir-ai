import { randomUUID } from 'node:crypto';
import type { LlmClient } from './llm/llm-client';
import type { AgentMessage, Offer } from './shared';
import type { OfferDraft } from './policy-guard';
import { computeTotal, PolicyGuard } from './policy-guard';
import type { AgentBusiness, Product } from './types';

export type Lang = 'uz' | 'ru';

/** Cyrillic-heavy text → Russian, otherwise Uzbek (Latin). */
export function detectLang(text: string): Lang {
  const cyr = (text.match(/[а-яё]/gi) ?? []).length;
  const lat = (text.match(/[a-z]/gi) ?? []).length;
  return cyr > lat ? 'ru' : 'uz';
}

export function langRule(lang: Lang): string {
  return lang === 'ru' ? 'Отвечай на русском языке.' : "O'zbek tilida (lotin yozuvida) javob ber.";
}

export function formatSum(n: number): string {
  return `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
}

export interface BusinessTurnInput {
  sessionId: string;
  business: AgentBusiness;
  products: Product[];
  history: AgentMessage[]; // full dialogue so far (personal_agent / biz_agent)
  round: number;
  lang: Lang;
}

export interface BusinessTurnResult {
  reply: string;
  offer?: Offer;
  confidence: number;
  violations: string[];
}

interface LlmBusinessReply {
  reply: string;
  offer?: OfferDraft | null;
  confidence?: number;
}

export class BusinessAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly guard: PolicyGuard,
  ) {}

  async respond(input: BusinessTurnInput): Promise<BusinessTurnResult> {
    const { business, products, round } = input;
    const { data } = await this.llm.completeJson<LlmBusinessReply>({
      model: 'sonnet',
      purpose: 'business_agent',
      system: this.systemPrompt(input),
      prompt: `Suhbat (raund ${round}/3):\n${renderHistory(input.history)}\n\nKeyingi javobingni JSON qilib ber.`,
    });

    const violations: string[] = [];
    let reply = String(data.reply ?? '').trim();
    let offer: Offer | undefined;

    if (data.offer && Array.isArray(data.offer.items) && data.offer.items.length > 0) {
      let draft: OfferDraft = {
        items: data.offer.items.map((it) => ({ productId: String(it.productId), qty: Number(it.qty) })),
        discountPct: Number(data.offer.discountPct) || 0,
      };
      // LLM never sets the total: compute from catalog, then validate.
      let check = this.guard.checkOffer({ business, products, draft, total: computeTotal(products, draft), round });
      if (!check.ok) {
        violations.push(check.reason);
        draft = this.guard.repairOffer(business, products, draft);
        const recheck = this.guard.checkOffer({ business, products, draft, total: computeTotal(products, draft), round });
        await this.guard.record('offer', check, { sessionId: input.sessionId, businessId: business.id, repaired: recheck.ok });
        check = recheck;
      }
      if (check.ok) {
        offer = {
          id: randomUUID(),
          sessionId: input.sessionId,
          items: draft.items,
          total: computeTotal(products, draft),
          discountPct: draft.discountPct,
          status: 'proposed',
        };
        reply = `${reply}\n${renderOfferLine(offer, products, input.lang)}`;
      } else {
        violations.push(check.reason);
      }
    }

    const confidence = clamp01(Number(data.confidence ?? 0.8));
    return { reply, offer, confidence, violations };
  }

  private systemPrompt(input: BusinessTurnInput): string {
    const b = input.business;
    const catalog = input.products
      .map((p) => `- ${p.id} | ${p.name} | ${p.price} so'm / ${p.unit}`)
      .join('\n');
    return [
      `Sen "${b.name}" (${b.category}, ${b.area}) biznesining AI sotuvchi-operatorisan.`,
      `Ish vaqti: ${b.hours.open}–${b.hours.close}. ${b.notes ?? ''}`,
      `Katalog (productId | nomi | narx):\n${catalog}`,
      'Qoidalar:',
      `- Faqat katalogdagi productId'lardan taklif qil. Katalogda yo'q narsani va'da qilma.`,
      `- Chegirma ${b.maxDiscountPct}% dan oshmasin. Birinchi taklifda chegirma bermaslikka harakat qil, mijoz so'rasa — asta-sekin ber.`,
      `- Ish vaqtidan tashqari vaqtga band qilma — boshqa vaqt taklif qil.`,
      `- Jami summani matnda YOZMA — tizim katalogdan o'zi hisoblab qo'shadi.`,
      `- Qisqa, xushmuomala, 1–3 gap. ${langRule(input.lang)}`,
      'JSON formati: {"reply": string, "offer": {"items":[{"productId": string, "qty": number}], "discountPct": number} | null, "confidence": number (0..1)}',
    ].join('\n');
  }
}

export function renderHistory(history: AgentMessage[]): string {
  if (history.length === 0) return '(bo‘sh)';
  return history.map((m) => `${roleLabel(m.role)}: ${m.text}`).join('\n');
}

function roleLabel(role: AgentMessage['role']): string {
  if (role === 'personal_agent') return 'Mijoz agenti';
  if (role === 'biz_agent') return 'Biznes agenti';
  if (role === 'user') return 'Mijoz';
  return 'Tizim';
}

export function renderOfferLine(offer: Offer, products: Product[], lang: Lang): string {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = offer.items.map((it) => `${byId.get(it.productId)?.name ?? it.productId} × ${it.qty}`).join(', ');
  const disc = offer.discountPct ? (lang === 'ru' ? `, скидка ${offer.discountPct}%` : `, chegirma ${offer.discountPct}%`) : '';
  return lang === 'ru'
    ? `Предложение: ${items}${disc}. Итого: ${formatSum(offer.total)}`
    : `Taklif: ${items}${disc}. Jami: ${formatSum(offer.total)}`;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}
