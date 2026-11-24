// Live loop-engineering demo: npx tsx apps/api/src/agents/loop/demo-loop.ts   (LLM_MODE=cli → `claude -p`)
import { randomUUID } from 'node:crypto';
import { createAgents, MemoryStore, streamLogger } from '../index';
import type { EvalResult } from './evaluator';

const BUSINESS_ID = 'biz-osh';
const out = (s: string): void => void process.stdout.write(`${s}\n`);
const pct = (n?: number): string => (n === undefined ? '-' : `${Math.round(n * 100)}%`);

async function main(): Promise<void> {
  const t0 = Date.now();
  const store = new MemoryStore();
  const agents = createAgents({ store, logger: streamLogger, llmMode: process.env.LLM_MODE === 'cli' ? 'cli' : 'sdk' });
  const loop = agents.loopEngine;

  // 1. Synthetic findings (in prod: Auditor after each closed session)
  const at = new Date().toISOString();
  const synthetic: [type: 'unanswered' | 'not_found' | 'policy', detail: string][] = [
    ['unanswered', "Mijoz uyga yetkazib berish bormi deb so'radi — agent aniq javob bermadi, xodimga ham ulamadi"],
    ['not_found', "Mijoz lag'mon so'radi — katalogda yo'q, agent nima qilishni bilmadi"],
    ['not_found', "Boshqa mijoz ham lag'mon va manti so'radi — katalogda yo'q"],
  ];
  for (const [type, detail] of synthetic) {
    await store.saveAuditFinding({ id: randomUUID(), sessionId: `s-${randomUUID().slice(0, 8)}`, businessId: BUSINESS_ID, type, detail, at });
  }
  out(`[findings] ${store.findings.length}:\n${store.findings.map((f) => `  - ${f.type}: ${f.detail}`).join('\n')}`);

  // 2. Loop: proposals → golden-set eval before vs after
  const r = await loop.run(BUSINESS_ID);
  if (r.baseline) printEval('BASELINE (active prompt)', r.baseline);
  out('\n=== PROPOSALS (pending owner approval) ===');
  for (const p of r.proposals) {
    out(`[${p.kind}] ${pct(p.evalBefore)} → ${pct(p.evalAfter)}  ${p.change}\n    sabab: ${p.reason}`);
  }
  for (const p of r.discarded) out(`[auto-rejected ${p.kind}] ${pct(p.evalBefore)} → ${pct(p.evalAfter)}  ${p.change}`);

  // 3. Owner approves the best prompt proposal (largest gain); nothing was applied before this line
  const best = r.proposals
    .filter((p) => p.kind === 'prompt')
    .sort((a, b) => (b.evalAfter ?? 0) - (a.evalAfter ?? 0))[0];
  if (!best) {
    out('\n[approve] no improved prompt proposal this run — nothing applied');
  } else {
    const after = r.evals[best.id];
    if (after) printEval('AFTER (best proposal)', after);
    const { version } = await loop.approve(best.id);
    out(`\n[approve] ${best.id.slice(0, 8)} → PromptVersion v${version?.version} active ` +
      `(${pct(version?.scoreBefore)} → ${pct(version?.scoreAfter)})\n  extraInstructions: ${version?.extraInstructions}`);

    // 4. Live check: the negotiating business agent now reads the active version from the store
    const [business] = await store.getBusinesses();
    const turn = await agents.businessAgent.respond({
      sessionId: 'live-check', business, products: await store.getProducts(BUSINESS_ID), round: 1, lang: 'uz',
      history: [{ id: randomUUID(), role: 'user', text: 'Uyga yetkazib berasizlarmi?', at }],
    });
    out(`[live] "Uyga yetkazib berasizlarmi?" → ${turn.reply}`);

    // 5. Rollback is one call
    const restored = await loop.rollback(BUSINESS_ID);
    out(`[rollback] active → ${restored ? `v${restored.version}` : 'base prompt'}; versions: ` +
      store.promptVersions.map((v) => `v${v.version}=${v.status}`).join(', '));
  }

  const calls = store.llmCalls;
  out(`\n[stats] llm calls=${calls.length} (${calls.filter((c) => !c.ok).length} failed) | total ${Math.round((Date.now() - t0) / 1000)}s`);
}

function printEval(title: string, e: EvalResult): void {
  out(`\n=== ${title}: ${e.passed}/${e.total} = ${pct(e.score)} ===`);
  for (const c of e.cases) {
    out(`  ${c.pass ? 'PASS' : 'FAIL'} ${c.caseId} "${c.question}"\n       → ${c.reply.replace(/\n/g, ' / ')}\n       judge: ${c.reason}`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`demo-loop failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
