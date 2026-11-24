// Live end-to-end demo: npx tsx apps/api/src/agents/demo.ts   (LLM_MODE=cli to use `claude -p` fallback)
import { createAgents, detectLang, EmbedClient, MemoryStore, streamLogger, topK } from './index';
import type { NegotiationEvent } from './shared';

const TEXT =
  'Ertaga kechqurun 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzordagi servisga mashinani moy almashtirishga yozdir';
const USER_ID = 'demo-user';
const out = (s: string): void => void process.stdout.write(`${s}\n`);

async function main(): Promise<void> {
  const t0 = Date.now();
  const store = new MemoryStore();
  const agents = createAgents({ store, logger: streamLogger, llmMode: process.env.LLM_MODE === 'cli' ? 'cli' : 'sdk' });
  const lang = detectLang(TEXT);

  // 0. PolicyGuard sanity (sync, no LLM)
  const osh = store.businesses[0];
  const oshProducts = await store.getProducts(osh.id);
  const bad = agents.guard.checkOffer({
    business: osh, products: oshProducts, round: 1, total: 1, draft: { items: [{ productId: 'osh-portion', qty: 6 }], discountPct: 25 },
  });
  out(`[guard] 25% discount on osh → ${JSON.stringify(bad)}`);

  // 1. Parse
  out(`\n> USER: ${TEXT}`);
  const tasks = await agents.personalAgent.parse(TEXT, await agents.memory.contextFor(USER_ID));
  out(`[parser] ${tasks.length} tasks: ${JSON.stringify(tasks)}`);

  // 2. Negotiate all tasks in parallel
  const names = new Map(store.businesses.map((b) => [b.id, b.name]));
  const results = await Promise.all(
    tasks.map(async (task) => {
      const [business] = await agents.personalAgent.findBusinesses(task);
      if (!business) {
        out(`[find] no business for ${task.category}`);
        return undefined;
      }
      const onEvent = (_sid: string, e: NegotiationEvent): void => out(`  [${business.name}] ${renderEvent(e)}`);
      const result = await agents.negotiator.run({ userId: USER_ID, business, task, lang, onEvent });
      return { result, task, business };
    }),
  );

  // 3. Final offers (waiting for human "Tasdiqlayman")
  out('\n=== FINAL ===');
  for (const r of results) {
    if (!r) continue;
    const o = r.result.offer;
    out(`${names.get(r.business.id)}: status=${r.result.status} rounds=${r.result.rounds}` +
      (o ? ` total=${o.total} discount=${o.discountPct}% offer=${o.status}` : ''));
  }

  // 4. Human confirms the first agreed offer (no payment/booking here)
  const first = results.find((r) => r?.result.offer)?.result.offer;
  if (first) out(`[confirm] Tasdiqlayman → ${(await agents.negotiator.confirm(first.id)).status}`);

  // 5. Auditor + memory (async after session)
  const post = await Promise.all(
    results.filter((r) => r !== undefined).map(async (r) => {
      const products = await store.getProducts(r.business.id);
      const [findings, facts] = await Promise.all([
        agents.auditor.review({ sessionId: r.result.sessionId, transcript: r.result.transcript, products, maxDiscountPct: r.business.maxDiscountPct }),
        agents.memory.extract({ userId: USER_ID, sessionId: r.result.sessionId, userText: TEXT, transcript: r.result.transcript }),
      ]);
      return { name: r.business.name, findings, facts };
    }),
  );
  for (const p of post) out(`[audit] ${p.name}: ${JSON.stringify(p.findings.map((f) => `${f.type}: ${f.detail}`))}`);
  out(`[memory] contextFor(${USER_ID}):\n${await agents.memory.contextFor(USER_ID)}`);

  // 6. Embeddings (local /embed only)
  try {
    const embed = new EmbedClient();
    const all = store.products;
    const [q, ...vecs] = await embed.embed(['mashina moyi', ...all.map((p) => p.name)]);
    const hits = topK(q, all.map((p, i) => ({ item: p, vector: vecs[i] })), 3);
    out(`[embed] "mashina moyi" → ${hits.map((h) => `${h.item.name} (${h.score.toFixed(2)})`).join(', ')}`);
  } catch (e) {
    out(`[embed] skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const calls = store.llmCalls;
  out(`\n[stats] llm calls=${calls.length} ` +
    calls.map((c) => `${c.purpose}/${c.model}:${c.ms}ms`).join(' ') +
    ` | violations=${store.violations.length} | total ${Date.now() - t0}ms`);
}

function renderEvent(e: NegotiationEvent): string {
  if (e.type === 'message') return `${e.message.role}: ${e.message.text.replace(/\n/g, ' / ')}`;
  if (e.type === 'offer') return `OFFER total=${e.offer.total} discount=${e.offer.discountPct}% items=${JSON.stringify(e.offer.items)}`;
  return `STATUS ${e.status}`;
}

main().catch((e: unknown) => {
  process.stderr.write(`demo failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
