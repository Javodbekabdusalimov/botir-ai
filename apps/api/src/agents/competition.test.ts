// Run: pnpm exec tsx apps/api/src/agents/competition.test.ts  (no network, no LLM, no DB)
import { strict as assert } from 'node:assert';
import { isComplete, rankContenders, winnerReason, type Contender } from './competition';
import { LlmClient } from './llm/llm-client';
import { PersonalAgent } from './personal-agent';
import { MemoryStore } from './store/memory-store';
import type { AgentBusiness, Product, UserTask } from './types';

const biz = (id: string, area: string, isDemo: boolean): AgentBusiness => ({
  id, name: id, category: 'restaurant', area, maxDiscountPct: 10, hours: { open: '09:00', close: '22:00' }, isDemo,
});
const contender = (id: string, total: number, discountPct: number): Contender => ({
  business: biz(id, '', false),
  offer: { id, sessionId: 's', items: [], total, discountPct, status: 'proposed' },
});
const ids = (ranked: Contender[]): string[] => ranked.map((c) => c.business.id);
const catalog: Product[] = [
  { id: 'osh', businessId: 'x', name: 'Osh (porsiya)', price: 45000, unit: 'porsiya' },
  { id: 'salad', businessId: 'x', name: 'Achchiq-chuchuk salat', price: 15000, unit: 'porsiya' },
  { id: 'table-8', businessId: 'x', name: '8 kishilik stol band qilish', price: 0, unit: 'stol' },
];
const basket = (id: string, total: number, items: Array<[string, number]>): Contender => ({
  business: biz(id, '', false), products: catalog,
  offer: { id, sessionId: 's', items: items.map(([productId, qty]) => ({ productId, qty })), total, discountPct: 0, status: 'proposed' },
});
const winners = (list: Contender[], task: UserTask): string[] => ids(rankContenders(list.filter((c) => isComplete(c, task))));

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
  assert.equal(winnerReason(rankContenders(list), 'uz'), "4 ta joydan 4 tasi to'liq taklif berdi → eng arzon");
  assert.equal(winnerReason(rankContenders(list.slice(0, 2)), 'uz', 3), "3 ta joydan 2 tasi to'liq taklif berdi → eng arzon");
  assert.match(winnerReason(rankContenders(list), 'ru'), /^Из 4 заведений .* самая низкая цена$/);
  assert.equal(winnerReason([], 'uz'), '');

  // Completeness: an incomplete basket or 0 so'm never wins, even when it is the cheapest.
  const sixOsh: UserTask = { category: 'restaurant', need: 'osh', people: 6, items: [{ name: 'osh' }] };
  const one = basket('one-portion', 50000, [['osh', 1]]);
  const six = basket('six-portions', 270000, [['osh', 6], ['table-8', 1]]);
  const free = basket('free-table', 0, [['table-8', 1]]);
  assert.deepEqual(winners([one, free, six], sixOsh), ['six-portions']);
  assert.equal(isComplete(free, { category: 'restaurant', need: 'stol' }), false); // total 0
  // Named item missing → loses; explicit counts are checked per item, people then only sizes the table.
  const withSalad: UserTask = { category: 'restaurant', need: 'stol', people: 8, items: [{ name: 'salat', qty: 2 }] };
  const tableSalad = basket('table-salad', 30000, [['table-8', 1], ['salad', 2]]);
  const tableOneSalad = basket('table-1-salad', 15000, [['table-8', 1], ['salad', 1]]);
  const oshOnly = basket('osh-only', 45000, [['osh', 1]]);
  assert.deepEqual(winners([tableOneSalad, oshOnly, tableSalad], withSalad), ['table-salad']);
  // Nobody complete → no winner at all (the service then sends an honest message instead).
  assert.deepEqual(winners([one, free], sixOsh), []);
  // Over the client's budget → incomplete.
  assert.equal(isComplete(six, { ...sixOsh, maxBudget: 200000 }), false);
  process.stdout.write('competition tests passed\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
