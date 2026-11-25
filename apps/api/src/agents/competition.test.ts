// Run: pnpm exec tsx apps/api/src/agents/competition.test.ts  (no network, no LLM, no DB)
import { strict as assert } from 'node:assert';
import { rankContenders, winnerReason, type Contender } from './competition';
import { LlmClient } from './llm/llm-client';
import { PersonalAgent } from './personal-agent';
import { MemoryStore } from './store/memory-store';
import type { AgentBusiness } from './types';

const biz = (id: string, area: string, isDemo: boolean): AgentBusiness => ({
  id, name: id, category: 'restaurant', area, maxDiscountPct: 10, hours: { open: '09:00', close: '22:00' }, isDemo,
});
const contender = (id: string, total: number, discountPct: number): Contender => ({
  business: biz(id, '', false),
  offer: { id, sessionId: 's', items: [], total, discountPct, status: 'proposed' },
});
const ids = (ranked: Contender[]): string[] => ranked.map((c) => c.business.id);

async function main(): Promise<void> {
  const store = new MemoryStore(false);
  const agent = new PersonalAgent(new LlmClient({ store }), store);
  const find = async (area?: string): Promise<string[]> =>
    (await agent.findBusinesses({ category: 'restaurant', need: 'osh', area })).map((b) => b.id);

  store.businesses.push(
    biz('demo-chil-1', 'Chilonzor', true),
    biz('demo-yun', 'Yunusobod', true),
    biz('demo-chil-2', 'Chilonzor', true),
    biz('real-yun', 'Yunusobod tumani', false),
    biz('real-chil', 'Chilonzor', false),
    { ...biz('real-shop', 'Chilonzor', false), category: 'shop' },
  );
  const stock = (businessId: string): void => {
    store.products.push({ id: `p-${businessId}`, businessId, name: 'Osh', price: 1000, unit: 'porsiya' });
  };
  store.businesses.forEach((b) => stock(b.id));
  // Nothing to sell → never takes a lane. Empty district → never matches an area.
  store.businesses.push(biz('real-empty', 'Chilonzor', false));
  // Requested area only, real first, otherwise store order.
  assert.deepEqual(await find('chilonzor'), ['real-chil', 'demo-chil-1', 'demo-chil-2']);
  assert.deepEqual(await find(' Yunusobod '), ['real-yun', 'demo-yun']);
  assert.deepEqual(await find('Chilonzor tumani'), ['real-chil', 'demo-chil-1', 'demo-chil-2']);
  // No area, or nobody in the area → whole category, real first.
  const everyone = ['real-yun', 'real-chil', 'demo-chil-1', 'demo-yun', 'demo-chil-2'];
  assert.deepEqual(await find(), everyone);
  assert.deepEqual(await find(''), everyone);
  assert.deepEqual(await find('Sergeli'), everyone);
  // Only a demo matches the area → other districts are not added.
  store.businesses.push(biz('demo-serg', 'Sergeli', true));
  stock('demo-serg');
  assert.deepEqual(await find('Sergeli'), ['demo-serg']);

  // Winner: lowest total, then higher discount, then input order. The input is not mutated.
  const list = [contender('a', 300, 10), contender('b', 250, 0), contender('c', 250, 5), contender('d', 250, 5)];
  assert.deepEqual(ids(rankContenders(list)), ['c', 'd', 'b', 'a']);
  assert.deepEqual(ids(list), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rankContenders([]), []);
  assert.equal(winnerReason(rankContenders(list), 'uz'), '4 ta joy raqobatlashdi → eng arzon');
  assert.match(winnerReason(rankContenders(list), 'ru'), /самая низкая цена$/);
  assert.equal(winnerReason([], 'uz'), '');
  process.stdout.write('competition tests passed\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
