import type { LlmClient } from './llm/llm-client';
import type { AgentMessage, Offer } from './shared';
import type { AgentStore } from './store/agent-store';
import type { Lang } from './business-agent';
import { langRule, renderHistory } from './business-agent';
import type { AgentBusiness, BusinessCategory, UserTask } from './types';

const CATEGORIES: BusinessCategory[] = ['restaurant', 'autoservice', 'shop', 'clinic'];

export type PersonalDecision =
  | { action: 'accept'; message: string }
  | { action: 'reject'; message: string }
  | { action: 'counter'; message: string };

export class PersonalAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
  ) {}

  /** User text → tasks (haiku, JSON). */
  async parse(text: string, memoryContext = ''): Promise<UserTask[]> {
    const { data } = await this.llm.completeJson<{ tasks?: UserTask[] }>({
      model: 'haiku',
      purpose: 'parser',
      system: [
        "Sen foydalanuvchi gapini vazifalarga ajratuvchi parser'san.",
        `category faqat: ${CATEGORIES.join('|')}. need — qisqa o'zbekcha (masalan "osh, joy band qilish", "moy almashtirish").`,
        "Ovqat/joy istaklarini (masalan \"piyozsiz\", \"deraza yonida\") need ichida saqla (masalan \"osh piyozsiz, joy band qilish\").",
        'when — matndagi vaqt iborasi (masalan "ertaga 18:00"), people — son, area — tuman nomi (masalan "Chilonzor").',
        "Matnda yo'q maydonni qo'shma.",
        memoryContext ? `Mijoz haqida ma'lum faktlar:\n${memoryContext}` : '',
        'JSON: {"tasks":[{"category":string,"need":string,"when"?:string,"people"?:number,"area"?:string}]}',
      ].join('\n'),
      prompt: text,
    });
    return (data.tasks ?? []).filter((t) => CATEGORIES.includes(t.category));
  }

  /** All businesses of the category (they compete); those in the requested area and demo ones first. */
  async findBusinesses(task: UserTask): Promise<AgentBusiness[]> {
    const all = await this.store.getBusinesses({ category: task.category });
    const area = task.area?.toLowerCase();
    const rank = (b: AgentBusiness): number =>
      (area && b.area.toLowerCase().includes(area) ? 0 : 2) + (b.isDemo ? 0 : 1);
    return all.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map((x) => x.b);
  }

  /** First message to the business agent (template, no LLM — fast and predictable). */
  requestText(task: UserTask, lang: Lang, memory: string[] = []): string {
    const parts = [task.need, task.when, task.people ? `${task.people} kishi` : undefined].filter(Boolean);
    const mem = memory.length
      ? lang === 'ru'
        ? ` Предпочтения клиента (из памяти): ${memory.join('; ')}.`
        : ` Mijozning odatlari (xotiradan): ${memory.join('; ')}.`
      : '';
    return lang === 'ru'
      ? `Здравствуйте! Я ассистент клиента. Нужно: ${parts.join(', ')}.${mem} Что можете предложить?`
      : `Assalomu alaykum! Men mijozning yordamchisiman. Kerak: ${parts.join(', ')}.${mem} Nima taklif qilasiz?`;
  }

  /** React to a business offer: accept, politely ask for a discount, or reject. */
  async decide(input: {
    task: UserTask;
    history: AgentMessage[];
    offer?: Offer;
    round: number;
    maxRounds: number;
    lang: Lang;
  }): Promise<PersonalDecision> {
    const last = input.round >= input.maxRounds;
    const { data } = await this.llm.completeJson<{ action?: string; message?: string }>({
      model: 'sonnet',
      purpose: 'personal_agent',
      system: [
        "Sen mijozning shaxsiy AI yordamchisisan. Biznes agenti bilan mijoz nomidan muzokara qilasan.",
        `Mijoz vazifasi: ${JSON.stringify(input.task)}.`,
        "Maqsad: vazifaga mos taklifni eng yaxshi narxda olish. Xushmuomala bo'l, qisqa yoz (1–2 gap).",
        "Agar taklif bor va hali chegirma so'ramagan bo'lsang — muloyimlik bilan chegirma so'ra (action=counter).",
        "Agar taklif vazifaga mos va chegirma allaqachon so'ralgan bo'lsa — accept.",
        "Agar taklif yo'q bo'lsa — aniqlashtir (counter). Vazifani umuman bajara olmasa — reject.",
        last ? "Bu OXIRGI raund: faqat accept yoki reject tanla." : '',
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
    // Last round: a still-open counter with a valid offer is treated as accept (human confirms anyway).
    if (last && action === 'counter') return input.offer ? { action: 'accept', message } : { action: 'reject', message };
    return { action, message };
  }
}
