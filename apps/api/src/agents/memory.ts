import type { LlmClient } from './llm/llm-client';
import type { AgentMessage } from './shared';
import type { AgentStore } from './store/agent-store';
import type { MemoryFact } from './types';

/** Only personal preferences are stored, so a fact may follow the client to any business. */
const PERSONAL_KINDS = new Set(['food', 'seating', 'party_size', 'time']);
/** One request ("6 kishilik", "ertaga 18:00") is not a habit: these kinds need the client's own "usually". */
const HABIT_KINDS = new Set(['party_size', 'time']);
const HABIT = /odatda|doim|har safar|одатда|доим|обычно|всегда/;

const norm = (s: string): string => s.toLowerCase().replace(/[ʻʼ'‘’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s: string): string[] => norm(s).split(' ').filter((w) => w.length >= 3);
/** Shares a word with the quote; prefixes count ("kishi" ~ "kishilik", "oshni" ~ "osh"). */
const sharesWord = (fact: string, quote: string): boolean =>
  words(fact).some((w) => words(quote).some((q) => w.startsWith(q) || q.startsWith(w)));

/** Customer memory: haiku extracts facts after a session; contextFor() feeds them into prompts. */
export class Memory {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
  ) {}

  /**
   * Facts only from the human's own words (`userText`). `transcript` is ignored on purpose: the agents' words
   * (a discount the AI asked for, a service it declined) are never facts about the human.
   * A fact is kept only with a verbatim quote from `userText` that shares a word with the fact.
   */
  async extract(input: { userId: string; sessionId: string; userText: string; transcript?: AgentMessage[] }): Promise<MemoryFact[]> {
    const { data } = await this.llm.completeJson<{ facts?: { fact?: unknown; quote?: unknown; kind?: unknown; weight?: unknown }[] }>({
      model: 'haiku',
      purpose: 'memory',
      system: [
        "Mijoz matnidan (faqat shu matndan) uning barqaror SHAXSIY odatlarini ajrat. Ruxsat etilgan kind:",
        '"food" — ovqat istagi (masalan "piyozsiz"), "seating" — afzal joy (masalan "deraza yonida"),',
        '"party_size" va "time" — faqat mijoz o\'zi "odatda"/"doim" desa (masalan "odatda 6 kishi bo\'lamiz", "doim kechqurun").',
        "Boshqa narsani YOZMA: bir martalik detallar (aniq sana, shu buyurtma), manzil/yashash joyi, telefon, mashina,",
        "narx yoki chegirmaga munosabat. Matnda aniq aytilmagan narsani taxmin qilma.",
        'Har fakt qisqa o\'zbekcha gap, mijozning o\'z so\'zini saqla. "quote" — mijoz matnidan AYNAN ko\'chirilgan bo\'lak.',
        "weight 0..1 — qanchalik muhim. Fakt bo'lmasa bo'sh ro'yxat qaytar.",
        'JSON: {"facts":[{"fact":string,"quote":string,"kind":"food"|"seating"|"party_size"|"time","weight":number}]}',
      ].join('\n'),
      prompt: `Mijoz matni: ${input.userText}`,
    });
    const said = norm(input.userText);
    const known = new Set((await this.store.getMemoryFacts(input.userId)).map((f) => norm(f.fact)));
    const at = new Date().toISOString();
    const facts: MemoryFact[] = [];
    for (const f of data.facts ?? []) {
      const fact = typeof f.fact === 'string' ? f.fact.trim() : '';
      const quote = typeof f.quote === 'string' ? norm(f.quote) : '';
      const kind = String(f.kind);
      const grounded = quote.length >= 3 && said.includes(quote) && sharesWord(fact, quote);
      const allowed = PERSONAL_KINDS.has(kind) && (!HABIT_KINDS.has(kind) || HABIT.test(quote));
      if (!fact || !grounded || !allowed || known.has(norm(fact))) continue;
      known.add(norm(fact));
      facts.push({
        userId: input.userId,
        fact,
        weight: Math.min(1, Math.max(0, Number(f.weight) || 0.5)),
        sessionId: input.sessionId,
        at,
      });
    }
    for (const f of facts) await this.store.saveMemoryFact(f);
    return facts;
  }

  /** Top distinct stable facts (weight ≥ minWeight, then recency). One-off details (low weight) are skipped. */
  async factsFor(userId: string, limit = 5, minWeight = 0.5): Promise<string[]> {
    const facts = (await this.store.getMemoryFacts(userId)).filter((f) => f.weight >= minWeight);
    const seen = new Set<string>();
    return facts
      .slice()
      .sort((a, b) => b.weight - a.weight || b.at.localeCompare(a.at))
      .filter((f) => !seen.has(f.fact.toLowerCase()) && seen.add(f.fact.toLowerCase()))
      .slice(0, limit)
      .map((f) => f.fact);
  }

  /** Top facts as prompt-ready bullet list. Empty string if none. */
  async contextFor(userId: string, limit = 5): Promise<string> {
    return (await this.factsFor(userId, limit)).map((f) => `- ${f}`).join('\n');
  }
}
