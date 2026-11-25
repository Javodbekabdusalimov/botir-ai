// Life of a fact after the owner confirms it: replace, restore, edit, delete, daily AI cap. Fake LLM, no network.
// Run (empty throwaway DB):
//   cd apps/api && rm -f prisma/lifecycle-test.db && DATABASE_URL=file:./lifecycle-test.db pnpm exec prisma db push --skip-generate
//   DATABASE_URL=file:./lifecycle-test.db pnpm exec tsx src/knowledge/knowledge-lifecycle.test.ts
import { strict as assert } from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { KnowledgeFact } from '@botir/shared';
import { createAgents } from '../agents';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { CatalogWriter } from './catalog-writer.service';
import { KnowledgeFactsService } from './facts.service';
import { loadKnowledge } from './knowledge-context';
import { MetricsService } from './metrics.service';
import { dailyCap, KnowledgeSourcesService } from './sources.service';

const db = new PrismaService();
const facts = new KnowledgeFactsService(db, new CatalogWriter(db), new MetricsService(db));
const agents = createAgents({ store: new PrismaAgentStore(db) });
let reply: Record<string, unknown>[] = [];
agents.llm.completeJson = (async () => ({ data: { facts: reply }, ms: 1 })) as unknown as typeof agents.llm.completeJson;
const sources = new KnowledgeSourcesService(db, agents);

const biz = async () => (await db.business.create({ data: { name: 'L', category: 'restaurant', workHours: '', maxDiscountPct: 10 } })).id;
const som = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');
const item = (topic: string, price: number) => ({ kind: 'catalog', topic, content: topic, price, unit: 'dona', evidence: `${topic} ${som(price)}`, confidence: 0.9 });
const policy = (topic: string, content: string) => ({ kind: 'policy', topic, content, evidence: content, confidence: 0.9 });
const statusOf = async (id: string) => (await db.knowledgeFact.findUniqueOrThrow({ where: { id } })).status;

async function settle(businessId: string): Promise<void> {
  for (let i = 0; i < 200 && (await db.knowledgeSource.count({ where: { businessId, status: 'processing' } })); i++) await sleep(10);
}

/** One text source through the real pipeline (fake LLM answer = `raw`) → the new draft facts. */
async function upload(businessId: string, text: string, raw: Record<string, unknown>[]): Promise<KnowledgeFact[]> {
  reply = raw;
  const source = await sources.addText(businessId, text, 'text');
  await settle(businessId);
  return (await facts.overview(businessId)).facts.filter((f) => f.sourceId === source.id);
}

async function restorePriceTest(): Promise<void> {
  const a = await biz();
  const price = async () => (await db.catalogItem.findFirstOrThrow({ where: { businessId: a, deletedAt: null } })).price;
  const [c8] = await upload(a, 'Cola 8 000', [item('Cola', 8000)]);
  assert.ok(c8);
  await facts.confirm(a, [c8.id]);
  const [c10] = await upload(a, 'Cola 10 000', [item('Cola', 10000)]);
  assert.ok(c10);
  await facts.confirm(a, [c10.id]);
  assert.deepEqual([await price(), await statusOf(c8.id)], [10000, 'superseded']);
  assert.equal((await upload(a, 'Cola 10 000', [item('Cola', 10000)])).length, 0, 'the current price again is a duplicate');

  const [back] = await upload(a, 'Cola 8 000', [item('Cola', 8000)]);
  assert.ok(back, 'the previous price is a change, not a duplicate');
  await facts.confirm(a, [back.id]);
  assert.deepEqual([await price(), await statusOf(c10.id), await statusOf(back.id)], [8000, 'superseded', 'confirmed']);

  await db.catalogItem.updateMany({ where: { businessId: a }, data: { price: 7000 } }); // POS sync / manual catalog edit
  assert.equal((await upload(a, 'Cola 8 000', [item('Cola', 8000)])).length, 1, 'catalog is the truth, not fact history');
  assert.equal(await db.catalogItem.count({ where: { businessId: a, deletedAt: null } }), 1);
}

async function supersedeTest(): Promise<void> {
  const a = await biz();
  const old = await upload(a, "Yetkazish 15 000 so'm. 200 000 dan bepul. Naqd va karta. Wi-Fi bor", [
    policy('delivery', "Yetkazish 15 000 so'm"), policy('delivery', '200 000 dan bepul'), policy('payment', 'Naqd va karta'), policy('other', 'Wi-Fi bor'),
  ]);
  await facts.confirm(a, old.map((f) => f.id));
  assert.ok((await loadKnowledge(db, a)).includes('200 000 dan bepul'), 'facts of one batch never replace each other');
  await facts.patch(a, old[1]?.id ?? '', { content: '200 000 dan yuqori bepul' });
  assert.equal(await statusOf(old[0]?.id ?? ''), 'confirmed', 'editing a confirmed fact archives nothing');

  const fresh = await upload(a, "Yetkazish 25 000 so'm, bepul yo'q. Parkovka bor", [policy('delivery', "Yetkazish 25 000 so'm, bepul yo'q"), policy('other', 'Parkovka bor')]);
  await facts.confirm(a, fresh.map((f) => f.id));
  const k = await loadKnowledge(db, a);
  assert.ok(k.includes('25 000') && !k.includes('15 000') && !k.includes('200 000'), 'the agent sees only the newest delivery terms');
  assert.ok(k.includes('Naqd va karta') && k.includes('Wi-Fi bor') && k.includes('Parkovka bor'), 'other topics and "other" stay');
  assert.equal(await statusOf(old[0]?.id ?? ''), 'superseded');

  const faq = (question: string, content: string) => ({ kind: 'faq', topic: 'parking', question, content, evidence: content, confidence: 0.9 });
  const [q1] = await upload(a, 'Joy bor, 10 ta mashina', [faq('Sizda parking bormi?', 'Joy bor, 10 ta mashina')]);
  const [q2] = await upload(a, 'Yo‘q, parkovka yopildi', [faq('Parking bormi', 'Yo‘q, parkovka yopildi')]);
  assert.ok(q1 && q2);
  await facts.confirm(a, [q1.id]);
  await facts.confirm(a, [q2.id]);
  assert.equal(await statusOf(q1.id), 'superseded', 'same question, newer answer');

  const restored = await facts.patch(a, old[0]?.id ?? '', { status: 'confirmed' }); // owner brings the old terms back
  assert.equal(restored.status, 'confirmed');
  assert.equal(await statusOf(fresh[0]?.id ?? ''), 'superseded');
  await assert.rejects(facts.patch(a, q1.id, { status: 'superseded' }), BadRequestException);
}

async function editDeleteTest(): Promise<void> {
  const a = await biz();
  const live = () => db.catalogItem.findMany({ where: { businessId: a, deletedAt: null } });
  const [osh] = await upload(a, 'Osh 45 000', [item('Osh', 45000)]);
  assert.ok(osh);
  await facts.confirm(a, [osh.id]);
  const edited = await facts.patch(a, osh.id, { price: '50.000', topic: "O'zbek oshi" });
  assert.deepEqual([edited.status, edited.price, edited.topic], ['confirmed', 50000, "O'zbek oshi"]);
  assert.deepEqual((await live()).map((i) => [i.name, i.price]), [["O'zbek oshi", 50000]], 'a confirmed edit reaches the catalog, name too');
  await assert.rejects(facts.patch(a, osh.id, { price: '45.5' }), BadRequestException);

  const [same] = await upload(a, 'Oshi O‘zbek 55 000', [item('Oshi O‘zbek', 55000)]);
  assert.ok(same);
  await facts.confirm(a, [same.id]);
  assert.deepEqual((await live()).map((i) => i.price), [55000], 'near-identical name updates the existing item');
  assert.equal(await statusOf(osh.id), 'superseded');

  await rejectsNotFound(facts.remove(await biz(), same.id));
  await facts.remove(a, osh.id); // history only: the live item stays
  assert.equal((await live()).length, 1);
  assert.deepEqual(await facts.remove(a, same.id), { id: same.id });
  assert.equal((await live()).length, 0, 'deleting a confirmed price takes it out of the catalog');
  assert.equal((await facts.overview(a)).facts.length, 0);
}

async function capTest(): Promise<void> {
  process.env.KNOWLEDGE_DAILY_CAP = '3';
  const a = await biz();
  await db.knowledgeSource.create({ data: { businessId: a, kind: 'text', label: 'old', status: 'ready', createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  await db.knowledgeSource.create({ data: { businessId: a, kind: 'sync', label: 'POS', status: 'ready' } });
  await db.knowledgeSource.create({ data: { businessId: a, kind: 'photo', label: 'deleted', status: 'failed', deletedAt: new Date() } }); // still cost a read
  reply = [];
  const results = await Promise.allSettled([1, 2, 3].map(() => sources.addText(a, 'Osh 45 000', 'text')));
  await settle(a);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2, 'parallel uploads cannot pass the same count');
  const refused = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
  assert.ok(refused instanceof HttpException && refused.getStatus() === 429 && /Bugungi limit tugadi.*3 ta/.test(refused.message), String(refused));
  assert.ok(await sources.addText(await biz(), 'Osh 45 000', 'text'), 'the cap is per business');
  delete process.env.KNOWLEDGE_DAILY_CAP;
  assert.equal(dailyCap(), 30);
}

const rejectsNotFound = (p: Promise<unknown>) => assert.rejects(p, (e) => e instanceof NotFoundException);

async function main(): Promise<void> {
  for (const t of [restorePriceTest, supersedeTest, editDeleteTest, capTest]) {
    await t();
    process.stdout.write(`${t.name}: OK\n`);
  }
  await sleep(100);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  process.stderr.write(`knowledge-lifecycle.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
