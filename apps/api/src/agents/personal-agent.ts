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
        'when — matndagi vaqt iborasi (masalan "ertaga 18:00"), people — son, area — tuman nomi (masalan "Chilonzor").',
        "Matnda yo'q maydonni qo'shma.",
        memoryContext ? `Mijoz haqida ma'lum faktlar:\n${memoryContext}` : '',
        'JSON: {"tasks":[{"category":string,"need":string,"when"?:string,"people"?:number,"area"?:string}]}',
      ].join('\n'),
      prompt: text,
    });
    return (data.tasks ?? []).filter((t) => CATEGORIES.includes(t.category));
  }

  /** Matching businesses: category + area, falls back to category only. */
  async findBusinesses(task: UserTask): Promise<AgentBusiness[]> {
    if (task.area) {
      const local = await this.store.getBusinesses({ category: task.category, area: task.area });
      if (local.length > 0) return local;
    }
    return this.store.getBusinesses({ category: task.category });
  }

  /** First message to the business agent (template, no LLM — fast and predictable). */
  requestText(task: UserTask, lang: Lang): string {
    const parts = [task.need, task.when, task.people ? `${task.people} kishi` : undefined].filter(Boolean);
    return lang === 'ru'
      ? `Здравствуйте! Я ассистент клиента. Нужно: ${parts.join(', ')}. Что можете предложить?`
      : `Assalomu alaykum! Men mijozning yordamchisiman. Kerak: ${parts.join(', ')}. Nima taklif qilasiz?`;
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
