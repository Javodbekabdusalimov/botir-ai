import type { LlmClient } from './llm/llm-client';
import type { AgentMessage } from './shared';
import type { AgentStore } from './store/agent-store';
import { renderHistory } from './business-agent';
import type { MemoryFact } from './types';

/** Customer memory: haiku extracts facts after a session; contextFor() feeds them into prompts. */
export class Memory {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
  ) {}

  async extract(input: { userId: string; sessionId: string; userText: string; transcript: AgentMessage[] }): Promise<MemoryFact[]> {
    const { data } = await this.llm.completeJson<{ facts?: { fact?: string; weight?: number }[] }>({
      model: 'haiku',
      purpose: 'memory',
      system: [
        "Mijoz haqida keyingi suhbatlarda foydali bo'ladigan barqaror faktlarni ajrat",
        "(odatlar, afzal ko'rgan joy/vaqt, oila soni, mashina, byudjetga munosabat). Bir martalik detallarni yozma.",
        "Har fakt qisqa o'zbekcha gap. weight 0..1 — qanchalik muhim. Faqat matnda bor narsani yoz.",
        'JSON: {"facts":[{"fact":string,"weight":number}]}',
      ].join('\n'),
      prompt: `Mijoz so'rovi: ${input.userText}\n\nMuzokara:\n${renderHistory(input.transcript)}`,
    });
    const at = new Date().toISOString();
    const facts: MemoryFact[] = (data.facts ?? [])
      .filter((f) => typeof f.fact === 'string' && f.fact.trim())
      .map((f) => ({
        userId: input.userId,
        fact: String(f.fact).trim(),
        weight: Math.min(1, Math.max(0, Number(f.weight) || 0.5)),
        sessionId: input.sessionId,
        at,
      }));
    for (const f of facts) await this.store.saveMemoryFact(f);
    return facts;
  }

  /** Top facts (weight, then recency) as prompt-ready bullet list. Empty string if none. */
  async contextFor(userId: string, limit = 5): Promise<string> {
    const facts = await this.store.getMemoryFacts(userId);
    const seen = new Set<string>();
    return facts
      .slice()
      .sort((a, b) => b.weight - a.weight || b.at.localeCompare(a.at))
      .filter((f) => !seen.has(f.fact) && seen.add(f.fact))
      .slice(0, limit)
      .map((f) => `- ${f.fact}`)
      .join('\n');
  }
}
