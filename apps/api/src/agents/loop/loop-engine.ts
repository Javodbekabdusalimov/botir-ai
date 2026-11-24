import { randomUUID } from 'node:crypto';
import type { LlmClient } from '../llm/llm-client';
import type { AgentLogger } from '../logger';
import { silentLogger } from '../logger';
import type { AgentStore } from '../store/agent-store';
import type { AuditFinding, Proposal, ProposalKind, PromptVersion } from '../types';
import type { EvalResult, Evaluator } from './evaluator';

interface RawProposal {
  kind?: string;
  change?: string;
  reason?: string;
  sourceFindingIds?: string[];
}

export interface LoopRunResult {
  baseline?: EvalResult;
  proposals: Proposal[]; // pending only (improved prompt proposals + catalog/faq)
  discarded: Proposal[]; // prompt proposals that did not beat the baseline
  evals: Record<string, EvalResult>; // proposalId → golden-set result with the change applied
}

const KINDS: ProposalKind[] = ['prompt', 'catalog', 'faq'];
const MAX_PROPOSALS = 3;

/**
 * Self-improvement loop with a human in the middle:
 * findings → ≤3 proposals → golden-set eval (before vs after) → owner approve()/reject() → PromptVersion; rollback().
 * Nothing changes agent behaviour until approve().
 */
export class LoopEngine {
  private readonly logger: AgentLogger;

  constructor(
    private readonly deps: { llm: LlmClient; store: AgentStore; evaluator: Evaluator; logger?: AgentLogger },
  ) {
    this.logger = deps.logger ?? silentLogger;
  }

  async run(businessId: string): Promise<LoopRunResult> {
    const { store, evaluator } = this.deps;
    // Dedup: findings already covered by a pending/approved proposal are not proposed again (repeat "Yaxshilash" clicks).
    const existing = (await store.getProposals(businessId)).filter((p) => p.status !== 'rejected');
    const covered = new Set(existing.flatMap((p) => p.sourceFindingIds));
    const findings = (await store.getAuditFindings(businessId)).filter((f) => !covered.has(f.id));
    if (findings.length === 0) return { proposals: [], discarded: [], evals: {} };

    const activeText = (await this.active(businessId))?.extraInstructions ?? '';
    const raw = await this.propose(businessId, activeText, findings);
    const now = new Date().toISOString();
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
    const seen = new Set(existing.map((p) => `${p.kind}:${norm(p.change)}`));
    const drafts: Proposal[] = raw.map((r): Proposal => ({
      id: randomUUID(),
      businessId,
      kind: r.kind as ProposalKind,
      change: String(r.change ?? '').trim(),
      reason: String(r.reason ?? ''),
      sourceFindingIds: (r.sourceFindingIds ?? []).filter((id) => findings.some((f) => f.id === id)),
      status: 'pending',
      createdAt: now,
    })).filter((d) => {
      const key = `${d.kind}:${norm(d.change)}`;
      if (!d.change || seen.has(key)) return false; // same change already proposed (or duplicated within this batch)
      seen.add(key);
      return true;
    });

    const promptDrafts = drafts.filter((d) => d.kind === 'prompt');
    const baseline = promptDrafts.length ? await evaluator.evaluate(businessId, activeText) : undefined;
    if (baseline) this.logger.log(`[loop] baseline ${baseline.passed}/${baseline.total}`);

    const proposals: Proposal[] = [];
    const discarded: Proposal[] = [];
    const evals: Record<string, EvalResult> = {};
    for (const d of drafts) {
      if (d.kind === 'prompt' && baseline) {
        const after = await evaluator.evaluate(businessId, joinInstructions(activeText, d.change));
        d.evalBefore = baseline.score;
        d.evalAfter = after.score;
        evals[d.id] = after;
        this.logger.log(`[loop] prompt proposal ${baseline.passed}/${baseline.total} → ${after.passed}/${after.total}`);
        if (after.score <= baseline.score) d.status = 'rejected'; // auto-rejected: no improvement on golden set
      }
      await store.saveProposal(d);
      (d.status === 'pending' ? proposals : discarded).push(d);
    }
    return { baseline, proposals, discarded, evals };
  }

  /** Owner approves. prompt/faq → new active PromptVersion (previous one stays for rollback); catalog → marked approved only. */
  async approve(proposalId: string): Promise<{ proposal: Proposal; version?: PromptVersion }> {
    const proposal = await this.pending(proposalId);
    proposal.status = 'approved';
    await this.deps.store.saveProposal(proposal);
    if (proposal.kind === 'catalog') return { proposal }; // owner adds the product + price in the catalog UI

    const { store } = this.deps;
    const versions = await store.getPromptVersions(proposal.businessId);
    const current = versions.find((v) => v.status === 'active');
    if (current) await store.savePromptVersion({ ...current, status: 'superseded' });
    const version: PromptVersion = {
      id: randomUUID(),
      businessId: proposal.businessId,
      version: (versions.at(-1)?.version ?? 0) + 1,
      extraInstructions: joinInstructions(current?.extraInstructions ?? '', proposal.change),
      status: 'active',
      scoreBefore: proposal.evalBefore,
      scoreAfter: proposal.evalAfter,
      createdAt: new Date().toISOString(),
    };
    await store.savePromptVersion(version);
    return { proposal, version };
  }

  async reject(proposalId: string): Promise<Proposal> {
    const proposal = await this.pending(proposalId);
    proposal.status = 'rejected';
    await this.deps.store.saveProposal(proposal);
    return proposal;
  }

  /** Active → rolled_back, previous superseded version → active. Returns the new active version (undefined = base prompt). */
  async rollback(businessId: string): Promise<PromptVersion | undefined> {
    const { store } = this.deps;
    const versions = await store.getPromptVersions(businessId);
    const current = versions.find((v) => v.status === 'active');
    if (!current) return undefined;
    await store.savePromptVersion({ ...current, status: 'rolled_back' });
    const previous = versions.filter((v) => v.status === 'superseded' && v.version < current.version).at(-1);
    if (!previous) return undefined;
    const restored: PromptVersion = { ...previous, status: 'active' };
    await store.savePromptVersion(restored);
    return restored;
  }

  async active(businessId: string): Promise<PromptVersion | undefined> {
    return (await this.deps.store.getPromptVersions(businessId)).find((v) => v.status === 'active');
  }

  private async pending(id: string): Promise<Proposal> {
    const p = await this.deps.store.getProposal(id);
    if (!p) throw new Error(`Proposal ${id} not found`);
    if (p.status !== 'pending') throw new Error(`Proposal ${id} is ${p.status}, not pending`);
    return { ...p };
  }

  private async propose(businessId: string, activeText: string, findings: AuditFinding[]): Promise<RawProposal[]> {
    const { llm, store } = this.deps;
    const business = (await store.getBusinesses()).find((b) => b.id === businessId);
    const products = await store.getProducts(businessId);
    const { data } = await llm.completeJson<{ proposals?: RawProposal[] }>({
      model: 'haiku',
      purpose: 'loop_proposer',
      system: [
        `Sen "${business?.name ?? businessId}" biznes AI-agentini yaxshilovchi muhandissan.`,
        `Katalog: ${products.map((p) => `${p.name} = ${p.price} so'm`).join('; ')}.`,
        `Hozirgi qo'shimcha ko'rsatmalar: ${activeText || "(yo'q)"}`,
        `Audit topilmalari asosida ko'pi bilan ${MAX_PROPOSALS} ta taklif ber. Turlari:`,
        "- prompt: agentga qisqa, aniq qoida (o'zbekcha, buyruq shaklida, 1–2 gap). Faktni to'qima — bilmagan narsani odamga (xodimga) ulashni buyur.",
        "- catalog: katalogga qo'shish kerak bo'lgan mahsulot nomi. Narxni O'YLAB TOPMA — 'narxini egasi belgilaydi' deb yoz.",
        "- faq: tez-tez so'raladigan savol + javob shabloni; noma'lum fakt o'rniga [egasi to'ldiradi].",
        'Har taklifga sabab va manba topilma id larini yoz.',
        'JSON: {"proposals":[{"kind":"prompt"|"catalog"|"faq","change":string,"reason":string,"sourceFindingIds":string[]}]}',
      ].join('\n'),
      prompt: findings.map((f) => `${f.id} [${f.type}] ${f.detail}`).join('\n'),
    });
    return (data.proposals ?? [])
      .filter((p) => KINDS.includes(p.kind as ProposalKind) && String(p.change ?? '').trim())
      .slice(0, MAX_PROPOSALS);
  }
}

function joinInstructions(base: string, add: string): string {
  return [base.trim(), add.trim()].filter(Boolean).join('\n');
}
