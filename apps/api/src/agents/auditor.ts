import type { LlmClient } from './llm/llm-client';
import type { AgentMessage } from './shared';
import type { AgentStore } from './store/agent-store';
import { renderHistory } from './business-agent';
import type { AuditFinding, AuditFindingType, Product } from './types';

interface RawFinding {
  type?: string;
  detail?: string;
}

const TYPES: AuditFindingType[] = ['fabricated_price', 'policy', 'unanswered', 'not_found'];

/** Async post-session review (haiku). Findings → store.saveAuditFinding. */
export class Auditor {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: AgentStore,
  ) {}

  async review(input: { sessionId: string; transcript: AgentMessage[]; products: Product[]; maxDiscountPct: number }): Promise<AuditFinding[]> {
    const catalog = input.products.map((p) => `${p.name}: ${p.price} so'm`).join('; ');
    const { data } = await this.llm.completeJson<{ findings?: RawFinding[] }>({
      model: 'haiku',
      purpose: 'auditor',
      system: [
        'Sen sifat auditorisan. Biznes agenti suhbatini tekshir.',
        `Katalog narxlari: ${catalog}. Maks chegirma: ${input.maxDiscountPct}%.`,
        "Topiladigan muammolar: fabricated_price (katalogda yo'q narx/mahsulot aytilgan), policy (qoida buzilgan, masalan chegirma limitdan oshgan),",
        "unanswered (mijoz savoliga javob berilmagan), not_found (mijoz so'ragan narsa katalogda yo'q).",
        "Muammo bo'lmasa bo'sh ro'yxat qaytar. Taxmin qilma — faqat matnda ko'ringanini yoz.",
        'JSON: {"findings":[{"type":"fabricated_price"|"policy"|"unanswered"|"not_found","detail":string}]}',
      ].join('\n'),
      prompt: renderHistory(input.transcript),
    });
    const at = new Date().toISOString();
    const findings: AuditFinding[] = (data.findings ?? [])
      .filter((f) => TYPES.includes(f.type as AuditFindingType))
      .map((f) => ({ sessionId: input.sessionId, type: f.type as AuditFindingType, detail: String(f.detail ?? ''), at }));
    for (const f of findings) await this.store.saveAuditFinding(f);
    return findings;
  }
}
