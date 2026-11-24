import { randomUUID } from 'node:crypto';
import type { BusinessAgent } from '../business-agent';
import type { LlmClient } from '../llm/llm-client';
import type { AgentStore } from '../store/agent-store';
import type { AgentBusiness, GoldenCase, Product } from '../types';

export interface CaseResult {
  caseId: string;
  question: string;
  reply: string;
  pass: boolean;
  reason: string;
}

export interface EvalResult {
  businessId: string;
  score: number; // 0..1 = passed / total
  passed: number;
  total: number;
  cases: CaseResult[];
}

const CONCURRENCY = 3;

/** Runs the business agent on every GoldenCase of a business and judges the answers. */
export class Evaluator {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
    private readonly businessAgent: BusinessAgent,
  ) {}

  async evaluate(businessId: string, extraInstructions: string): Promise<EvalResult> {
    const business = (await this.store.getBusinesses()).find((b) => b.id === businessId);
    if (!business) throw new Error(`Evaluator: unknown business ${businessId}`);
    const products = await this.store.getProducts(businessId);
    const golden = await this.store.getGoldenCases(businessId);

    const cases = await mapLimit(golden, CONCURRENCY, (c) =>
      this.runCase(c, business, products, extraInstructions).catch((e: unknown) => ({
        caseId: c.id, question: c.question, reply: '', pass: false,
        reason: `agent error: ${e instanceof Error ? e.message : String(e)}`,
      })),
    );

    const passed = cases.filter((r) => r.pass).length;
    return { businessId, score: golden.length ? passed / golden.length : 0, passed, total: golden.length, cases };
  }

  private async runCase(c: GoldenCase, business: AgentBusiness, products: Product[], extraInstructions: string): Promise<CaseResult> {
    const turn = await this.businessAgent.respond({
      sessionId: `eval-${randomUUID()}`,
      business,
      products,
      history: [{ id: randomUUID(), role: 'user', text: c.question, at: new Date().toISOString() }],
      round: 1,
      lang: 'uz',
      extraInstructions,
    });
    const base = { caseId: c.id, question: c.question, reply: turn.reply };
    // Deterministic checks first: no LLM needed to catch a wrong price or a guard violation.
    const badPrice = findWrongPrice(turn.reply, products, turn.offer?.total);
    if (badPrice !== undefined) return { ...base, pass: false, reason: `katalogda yo'q narx: ${badPrice}` };
    if (turn.violations.length) return { ...base, pass: false, reason: `policy: ${turn.violations.join('; ')}` };
    return { ...base, ...(await this.judge(c, turn.reply, business, products)) };
  }

  private async judge(c: GoldenCase, reply: string, business: AgentBusiness, products: Product[]): Promise<{ pass: boolean; reason: string }> {
    try {
      const { data } = await this.llm.completeJson<{ pass?: boolean; reason?: string }>({
        model: 'haiku',
        purpose: 'eval_judge',
        system: [
          'Sen qat\'iy baholovchisan. Biznes agentining mijozga javobini tekshir.',
          `Biznes faktlari: ish vaqti ${business.hours.open}–${business.hours.close}; maks chegirma ${business.maxDiscountPct}%; ${business.notes ?? ''}`,
          `Katalog: ${products.map((p) => `${p.name} = ${p.price} so'm`).join('; ')}.`,
          "Biznes faktlari va katalogdagi ma'lumotni aytish to'qish EMAS.",
          "FAQAT ikki narsani tekshir: (1) har bir kutilgan fakt javobda ma'nosi bo'yicha bormi, (2) taqiqlangan narsa bormi.",
          "Boshqa narsa uchun (qo'shimcha taklif, savol, ish vaqti, 'Taklif/Jami' qatori) FAIL qilma.",
          'pass=true ⇔ hamma kutilgan fakt bor VA taqiqlangan narsa yo\'q. Avval reason yoz, keyin unga mos pass.',
          'JSON: {"reason": string (qisqa, o\'zbekcha), "pass": boolean}',
        ].join('\n'),
        prompt: [
          `Mijoz savoli: ${c.question}`,
          `Kutilgan faktlar: ${c.expected.map((e) => `- ${e}`).join('\n')}`,
          c.forbidden?.length ? `Taqiqlangan: ${c.forbidden.map((f) => `- ${f}`).join('\n')}` : '',
          `Agent javobi: ${reply}`,
        ].join('\n'),
      });
      return { pass: data.pass === true, reason: String(data.reason ?? '') };
    } catch (e) {
      return { pass: false, reason: `judge error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

/** Every money-like number (≥1000) in the reply must be a catalog price, its multiple, or the code-computed total. */
export function findWrongPrice(reply: string, products: Product[], total?: number): number | undefined {
  const prices = products.map((p) => p.price).filter((p) => p > 0);
  const numbers = (reply.match(/\d{1,3}(?:[\s  .,]\d{3})+|\d{4,}/g) ?? []).map((s) => Number(s.replace(/\D/g, '')));
  return numbers.find(
    (n) => n >= 1000 && n !== total && !prices.some((p) => n % p === 0 && n / p <= 100) && !isYear(n),
  );
}

function isYear(n: number): boolean {
  return n >= 2020 && n <= 2035;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
