// Run: pnpm exec tsx apps/api/src/agents/personal-agent.test.ts  (no network, no LLM, no DB)
import { strict as assert } from 'node:assert';
import type { Business as DbBusiness } from '@prisma/client';
import { toAgentBusiness } from '../db/mappers';
import { BusinessAgent, detectLang, parseQty, tashkentNow } from './business-agent';
import { LlmClient } from './llm/llm-client';
import type { AgentLogger } from './logger';
import { Memory } from './memory';
import { catalogScore, checkClientConditions, PersonalAgent } from './personal-agent';
import { PolicyGuard } from './policy-guard';
import type { AgentMessage, Offer } from './shared';
import type { AgentStore } from './store/agent-store';
import { MemoryStore } from './store/memory-store';
import type { AgentBusiness, UserTask } from './types';

type LlmInput = Parameters<LlmClient['completeJson']>[0];

/** Scripted LLM: records every call, answers with reply(input). */
class FakeLlm extends LlmClient {
  readonly calls: LlmInput[] = [];
  constructor(store: AgentStore, private readonly reply: (input: LlmInput) => unknown) {
    super({ store });
  }
  override async completeJson<T>(input: LlmInput): Promise<{ data: T; ms: number }> {
    this.calls.push(input);
    return { data: this.reply(input) as T, ms: 1 };
  }
}

const offer = (items: Offer['items'], total: number, discountPct = 0): Offer => ({
  id: 'o1', sessionId: 's1', items, total, discountPct, status: 'proposed',
});

async function budgetAndQuantityGuard(): Promise<void> {
  const store = new MemoryStore();
  let llmAction = 'accept';
  const llm = new FakeLlm(store, () => ({ action: llmAction, message: 'Qabul qilamiz' }));
  const agent = new PersonalAgent(llm, store);
  const task: UserTask = {
    category: 'restaurant', need: 'osh, joy band qilish', people: 6, maxBudget: 260_000,
    items: [{ name: 'osh', qty: 6 }, { name: 'stol band qilish' }],
  };
  const decide = (o: Offer, round = 1) => agent.decide({ task, history: [], offer: o, round, maxRounds: 3, lang: 'uz' });
  const full = [{ productId: 'osh-portion', qty: 6 }, { productId: 'osh-table-6', qty: 1 }];

  // Over budget: counter without asking the LLM, the budget number is not revealed to the seller.
  const over = await decide(offer(full, 270_000));
  assert.equal(over.action, 'counter');
  assert.match(over.message, /byudjet/);
  assert.ok(!over.message.includes('260'));
  assert.equal(llm.calls.length, 0);
  // Last round over budget → reject, never accept.
  assert.equal((await decide(offer(full, 270_000), 3)).action, 'reject');

  // "6 porsiya" asked, 1 offered: the LLM would accept, code says no.
  const short = await decide(offer([{ productId: 'osh-portion', qty: 1 }, { productId: 'osh-table-6', qty: 1 }], 45_000));
  assert.equal(short.action, 'counter');
  assert.match(short.message, /osh × 6 yo'q/);
  // Missing item (no table) on the last round → reject.
  assert.equal((await decide(offer([{ productId: 'osh-portion', qty: 6 }], 270_000, 5), 3)).action, 'reject');
  assert.equal(llm.calls.length, 0);

  // All conditions hold → the LLM decides; the budget never reaches its prompt.
  assert.equal((await decide(offer(full, 256_500, 5))).action, 'accept');
  assert.equal(llm.calls.length, 1);
  assert.ok(!llm.calls[0].system.includes('260000') && llm.calls[0].system.includes('Toshkent vaqti'));
  // Last round, LLM still unsatisfied (counter) → reject, no silent accept.
  llmAction = 'counter';
  assert.equal((await decide(offer(full, 256_500, 5), 3)).action, 'reject');

  // Pure check: no items / no budget → nothing to enforce; name match tolerates suffixes and extra words.
  const products = await store.getProducts('biz-osh');
  assert.equal(checkClientConditions({ category: 'restaurant', need: 'osh' }, offer(full, 1), products), null);
  assert.equal(checkClientConditions({ ...task, items: [{ name: 'oshni', qty: 6 }] }, offer(full, 256_500), products), null);
}

async function businessAgentQuantity(): Promise<void> {
  const store = new MemoryStore();
  let qty: unknown = '6 porsiya';
  const llm = new FakeLlm(store, () => ({ reply: 'Marhamat', offer: { items: [{ productId: 'osh-portion', qty }], discountPct: 0 }, confidence: 0.9 }));
  const agent = new BusinessAgent(llm, new PolicyGuard(store), store);
  const [business] = store.businesses;
  const products = await store.getProducts(business.id);
  const respond = () => agent.respond({ sessionId: 's', business, products, history: [], round: 1, lang: 'uz' });

  const six = await respond();
  assert.deepEqual([six.offer?.items, six.offer?.total, six.violations], [[{ productId: 'osh-portion', qty: 6 }], 270_000, []]);
  assert.ok(llm.calls[0].system.includes('Toshkent vaqti') && !llm.calls[0].system.includes('xodimdan aniqlab'));
  for (const unclear of ['olti', 1.5, '1.5 kg', null, 0]) {
    qty = unclear;
    const r = await respond();
    assert.equal(r.offer, undefined, `qty ${String(unclear)} must not become an offer`);
    assert.match(r.violations[0] ?? '', /unclear qty/);
  }
  assert.equal(store.violations.filter((v) => /unclear qty/.test(v.reason)).length, 5);
  assert.deepEqual([parseQty(6), parseQty(' 3 ta'), parseQty('2,5'), parseQty(-1), parseQty('x')], [6, 3, undefined, undefined, undefined]);
}

async function badBusinessIsSkipped(): Promise<void> {
  class BrokenStore extends MemoryStore {
    override async getProducts(businessId: string) {
      if (businessId === 'boom') throw new Error('Value 3000000000 does not fit in an INT column');
      return super.getProducts(businessId);
    }
  }
  const store = new BrokenStore(false);
  const warns: string[] = [];
  const logger: AgentLogger = { log: () => undefined, warn: (m) => void warns.push(m), error: () => undefined };
  const agent = new PersonalAgent(new FakeLlm(store, () => ({})), store, logger);
  const biz = (id: string, hours = { open: '10:00', close: '23:00' }): AgentBusiness => ({
    id, name: id, category: 'restaurant', area: 'Chilonzor', maxDiscountPct: 5, hours, isDemo: false,
  });
  store.businesses.push(biz('good'), biz('boom'), biz('bad-price'), biz('bad-hours', { open: '', close: '' }), biz('empty'));
  for (const id of ['good', 'boom', 'bad-price', 'bad-hours']) {
    store.products.push({ id: `p-${id}`, businessId: id, name: 'Osh', price: id === 'bad-price' ? 3_000_000_000 : 45_000, unit: 'porsiya' });
  }
  const found = await agent.findBusinesses({ category: 'restaurant', need: 'osh', area: 'Chilonzor' });
  assert.deepEqual(found.map((b) => b.id), ['good']);
  assert.equal(warns.length, 3, warns.join('\n'));
  assert.ok(['boom', 'bad-price', 'bad-hours'].every((id) => warns.some((w) => w.includes(id))));

  // Mapper: broken hours never throw (they used to kill getBusinesses for the whole category).
  const row = { id: 'x', name: 'X', category: 'restaurant', district: 'Chilonzor', maxDiscountPct: 5, isDemo: false, notes: null };
  for (const workHours of ['null', '{"mon":"09:00"}', '[1,2]']) {
    assert.deepEqual(toAgentBusiness({ ...row, workHours } as DbBusiness).hours, { open: '', close: '' }, workHours);
  }
  assert.deepEqual(toAgentBusiness({ ...row, workHours: '' } as DbBusiness).hours, { open: '09:00', close: '21:00' });
  assert.deepEqual(toAgentBusiness({ ...row, workHours: '{"mon":null,"tue":["10:00","20:00"]}' } as DbBusiness).hours, { open: '10:00', close: '20:00' });
}

async function catalogMatchRanksFirst(): Promise<void> {
  const store = new MemoryStore(false);
  const agent = new PersonalAgent(new FakeLlm(store, () => ({})), store);
  const biz = (id: string, isDemo: boolean): AgentBusiness => ({
    id, name: id, category: 'restaurant', area: 'Chilonzor', maxDiscountPct: 5, hours: { open: '10:00', close: '23:00' }, isDemo,
  });
  const sell = (businessId: string, ...names: string[]): void => {
    names.forEach((name, i) => store.products.push({ id: `${businessId}-${i}`, businessId, name, price: 45_000, unit: 'porsiya' }));
  };
  // Store order: demo C first, then the real ones. Real A and D have no osh.
  store.businesses.push(biz('C', true), biz('A', false), biz('B', false), biz('D', false));
  sell('C', 'Osh (porsiya)', '8 kishilik stol band qilish');
  sell('A', "Lag'mon", 'Choy', '8 kishilik stol band qilish');
  sell('B', 'Osh', 'Non');
  sell('D', 'Shashlik');
  const top3 = async (task: UserTask): Promise<string[]> => (await agent.findBusinesses(task)).slice(0, 3).map((b) => b.id);
  // "6 kishilik osh": catalog match first, real before demo at equal score, then store order.
  const osh: UserTask = { category: 'restaurant', need: 'osh', people: 6, area: 'Chilonzor', items: [{ name: 'osh' }] };
  assert.deepEqual(await top3(osh), ['B', 'C', 'A']);
  // No items: each comma part of `need` counts. C has both (2); A (stol) and B (osh) tie at 1 → store order.
  assert.deepEqual(await top3({ category: 'restaurant', need: 'osh, stol band qilish' }), ['C', 'A', 'B']);
  // Nothing matches → the old order (real first, store order), still capped.
  assert.deepEqual(await top3({ category: 'restaurant', need: 'pitsa', items: [{ name: 'pitsa' }] }), ['A', 'B', 'D']);
  assert.equal(catalogScore({ category: 'restaurant', need: '' }, store.products), 0);
}

async function parserKeepsTasksApart(): Promise<void> {
  const store = new MemoryStore(false);
  const llm = new FakeLlm(store, () => ({
    tasks: [
      { category: 'restaurant', need: 'stol band qilish', when: '13:00', people: 6 },
      { category: 'restaurant', need: 'stol band qilish', when: '19:00', people: 8, wishes: '  deraza   yonida ', maxBudget: '300 000' },
      { category: 'beauty', need: 'soch olish' },
      { category: 'other', need: 'gul yetkazish' },
      { category: 'pizza', need: 'x' },
      { category: 'restaurant', need: 'osh', people: 'olti', maxBudget: 1.5, items: [{ name: 'osh', qty: '6' }, { name: '', qty: 2 }, { name: 'choy', qty: 0 }] },
    ],
  }));
  const tasks = await new PersonalAgent(llm, store).parse('13:00 ga 6 kishiga va 19:00 ga 8 kishiga stol, ...');
  assert.deepEqual(tasks, [
    { category: 'restaurant', need: 'stol band qilish', when: '13:00', people: 6 },
    { category: 'restaurant', need: 'stol band qilish', when: '19:00', people: 8, wishes: 'deraza yonida', maxBudget: 300_000 },
    { category: 'beauty', need: 'soch olish' },
    { category: 'other', need: 'gul yetkazish' },
    { category: 'restaurant', need: 'osh', items: [{ name: 'osh', qty: 6 }, { name: 'choy' }] },
  ]);
  const system = llm.calls[0].system;
  assert.ok(['- beauty:', '- other:', 'IKKI vazifa', 'maxBudget', 'Toshkent vaqti'].every((s) => system.includes(s)));
}

async function memoryKeepsOnlyHumanFacts(): Promise<void> {
  const store = new MemoryStore(false);
  const llm = new FakeLlm(store, () => ({
    facts: [
      { fact: 'Oshni piyozsiz yeydi', quote: 'piyozsiz', kind: 'food', weight: 0.8 },
      { fact: "Chegirma so'rashni yaxshi ko'radi", quote: 'chegirma', kind: 'food', weight: 0.5 }, // AI's words, not in the text
      { fact: 'Yunusobodda yashaydi', quote: 'Yunusobodda', kind: 'address', weight: 0.7 }, // not a personal preference
      { fact: 'Odatda 6 kishi', quote: '6 kishilik', kind: 'party_size', weight: 0.6 }, // one request is not a habit
      { fact: "Odatda 4 kishi bo'lib keladi", quote: 'odatda 4 kishi', kind: 'party_size', weight: 0.6 },
      { fact: "Go'sht yemaydi", quote: 'piyozsiz', kind: 'food', weight: 0.9 }, // fact does not use the quoted words
    ],
  }));
  const memory = new Memory(llm, store);
  const transcript: AgentMessage[] = [{ id: 'm', role: 'personal_agent', text: 'Chegirma qilib bera olasizmi?', at: '' }];
  const input = { userId: 'u', sessionId: 's', userText: "Ertaga Yunusobodda 6 kishilik osh, piyozsiz bo'lsin. Biz odatda 4 kishi bo'lamiz", transcript };
  const saved = await memory.extract(input);
  assert.deepEqual(saved.map((f) => f.fact), ['Oshni piyozsiz yeydi', "Odatda 4 kishi bo'lib keladi"]);
  assert.ok(!llm.calls[0].prompt.includes('Chegirma qilib'), 'agent dialogue never reaches the memory prompt');
  assert.equal((await memory.extract(input)).length, 0, 'known facts are not saved twice');
  assert.equal(store.memoryFacts.length, 2);
}

function languageAndClock(): void {
  assert.equal(detectLang('Эртага соат 18:00 га 6 кишига ош керак'), 'uz');
  assert.equal(detectLang('Менга ўзбекча жавоб беринг'), 'uz');
  assert.equal(detectLang('Ertaga 18:00 ga 6 kishilik osh'), 'uz');
  assert.equal(detectLang('Завтра в 18:00 столик на 6 человек'), 'ru');
  assert.equal(detectLang('Нужно 3 бутылки воды домой, пожалуйста'), 'ru');
  assert.equal(tashkentNow(new Date('2026-11-25T09:05:00Z')), 'Hozir (Toshkent vaqti): 2026-11-25, chorshanba, 14:05.');
  assert.equal(tashkentNow(new Date('2026-11-29T20:30:00Z')), 'Hozir (Toshkent vaqti): 2026-11-30, dushanba, 01:30.');
}

async function parserFillsDistrict(): Promise<void> {
  const store = new MemoryStore();
  const llm = (areas: Array<string | undefined>) => new FakeLlm(store, () => ({
    tasks: areas.map((area, i) => ({ category: 'restaurant', need: `osh ${i}`, ...(area ? { area } : {}) })),
  }));
  // "Chilonzorda" → Chilonzor (also when the LLM returns the suffixed form), text names it once → tasks without area get it.
  const t1 = await new PersonalAgent(llm(['Chilonzorda', undefined]), store).parse('Chilonzorda osh va salat');
  assert.deepEqual(t1.map((t) => t.area), ['Chilonzor', 'Chilonzor']);
  // The request-body district is the last fallback, and never overrides what the text says.
  const t2 = await new PersonalAgent(llm([undefined]), store).parse('osh kerak', '', 'Yunusobod');
  assert.equal(t2[0]?.area, 'Yunusobod');
  const t3 = await new PersonalAgent(llm([undefined]), store).parse('Chilonzorda osh', '', 'Yunusobod');
  assert.equal(t3[0]?.area, 'Chilonzor');
  const t4 = await new PersonalAgent(llm([undefined]), store).parse('osh kerak');
  assert.equal(t4[0]?.area, undefined, 'no district anywhere → none invented');
}

async function main(): Promise<void> {
  languageAndClock();
  await parserFillsDistrict();
  await budgetAndQuantityGuard();
  await businessAgentQuantity();
  await badBusinessIsSkipped();
  await catalogMatchRanksFirst();
  await parserKeepsTasksApart();
  await memoryKeepsOnlyHumanFacts();
  process.stdout.write('personal-agent tests passed\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
