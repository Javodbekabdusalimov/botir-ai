// Run: pnpm exec tsx apps/api/src/billing/billing.test.ts  (temp SQLite file, no network, no real claude)
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Request, Response } from 'express';

const dir = mkdtempSync(join(tmpdir(), 'billing-test-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

async function main(): Promise<void> {
  const apiDir = join(__dirname, '..', '..');
  execFileSync('node', ['scripts/prisma.mjs', 'db', 'push', '--skip-generate', '--accept-data-loss'], { cwd: apiDir, env: process.env, stdio: 'pipe' });
  const { PrismaClient } = await import('@prisma/client');
  const { BillingService, MSG, dayKey, nextReset } = await import('./billing.service');
  const { BillingMiddleware } = await import('./billing.middleware');
  const { tokensForCost } = await import('./billing-plans');
  const { currentBillingOwner, runWithBillingOwner } = await import('./billing-context');
  const { matchProducts, searchTotal } = await import('./agent-search');
  const { LlmClient } = await import('../agents/llm/llm-client');
  const { MemoryStore } = await import('../agents/store/memory-store');
  type SdkQuery = import('../agents/llm/llm-client').SdkQuery;

  const db = new PrismaClient();
  // PrismaClient loads apps/api/.env (dev prices): the test must run on the defaults.
  for (const k of Object.keys(process.env).filter((k) => k.startsWith('PLAN_') || k === 'BILLING_ENFORCE')) delete process.env[k];
  const billing = new BillingService(
    db as never,
    { userFromToken: async () => null } as never,
    { llm: { setOnCost: () => undefined } } as never,
    {
      // Like the real providers: one Payment row per payment ref.
      createPaymentLink: async (o: { id: string; total: number; businessId: string }) => {
        const exists = await db.payment.findFirst({ where: { orderId: o.id } });
        if (!exists) await db.payment.create({ data: { orderId: o.id, kind: 'subscription', businessId: o.businessId, billId: `bill-${o.id}`, link: `http://pay/${o.id}`, amount: o.total } });
        return { payUrl: `http://pay/${o.id}`, billId: `bill-${o.id}` };
      },
    },
  );
  const alice = { ownerType: 'user', ownerId: 'alice' } as const;
  const shop = { ownerType: 'business', ownerId: 'biz-x' } as const;
  const T0 = new Date('2026-11-25T10:00:00Z'); // 15:00 Tashkent

  // 1. token math: round UP, float noise does not add a token
  assert.equal(tokensForCost(0.0001), 1);
  assert.equal(tokensForCost(0.001), 1);
  assert.equal(tokensForCost(0.003), 3);
  assert.equal(tokensForCost(0.0031), 4);
  assert.equal(tokensForCost(0), 0);
  assert.equal(tokensForCost(Number.NaN), 0);

  // 2. day = Asia/Tashkent: 19:30Z is still the 25th (00:30 on the 26th in Tashkent → new day)
  assert.equal(dayKey(new Date('2026-11-25T18:59:00Z')), '2026-11-25');
  assert.equal(dayKey(new Date('2026-11-25T19:00:00Z')), '2026-11-26');
  assert.equal(nextReset(T0).toISOString(), '2026-11-25T19:00:00.000Z');

  // 3. FREE: no row = free; 3 search requests a day, the 4th is 429; the next Tashkent day resets
  assert.equal((await billing.status(alice, T0)).plan, 'free');
  assert.equal((await billing.status(alice, T0)).freeLeftToday, 3);
  for (let i = 0; i < 3; i++) await billing.assertSearchAllowed(alice, T0);
  await assert.rejects(billing.assertSearchAllowed(alice, T0), (e: unknown) => (e as { getStatus(): number; message: string }).getStatus() === 429 && (e as Error).message === "Bugungi 3 ta bepul so'rov tugadi");
  assert.equal((await billing.status(alice, T0)).freeLeftToday, 0);
  await billing.assertSearchAllowed(alice, new Date('2026-11-25T19:00:01Z')); // next day
  // concurrent requests never exceed the quota
  const bob = { ownerType: 'user', ownerId: 'bob' } as const;
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => billing.assertSearchAllowed(bob, T0)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);

  // 4. gating: FREE blocked with the Uzbek message
  assert.equal(await billing.gate(alice, 'agent', T0), MSG.needProAgent);
  assert.equal(await billing.gate(alice, 'telegram', T0), MSG.needProTelegram);

  // 5. paid → PRO for 30 days; daily tokens 150; debit rounds up; out of tokens → 402 text; next day refills
  const until = await billing.activate(db, alice, 'pro', T0);
  assert.equal(until.toISOString(), '2026-12-25T10:00:00.000Z');
  let s = await billing.status(alice, T0);
  assert.deepEqual([s.plan, s.dailyTokens, s.tokensLeftToday, s.freeLeftToday], ['pro', 150, 150, 0]);
  assert.equal(await billing.gate(alice, 'agent', T0), null);
  await billing.debit(alice, 0.0031, T0); // 4 tokens
  await billing.debit(alice, 0.05, T0); // 50 tokens
  s = await billing.status(alice, T0);
  assert.deepEqual([s.tokensToday, s.tokensLeftToday], [54, 96]);
  await billing.debit(alice, 0.2, T0);
  assert.equal(await billing.gate(alice, 'agent', T0), MSG.tokensOut);
  await assert.rejects(billing.assertSearchAllowed(alice, T0), (e: unknown) => (e as { getStatus(): number }).getStatus() === 402);
  assert.equal(await billing.gate(alice, 'agent', new Date('2026-11-25T19:00:01Z')), null, 'tokens are back after 00:00 Tashkent');
  assert.equal((await billing.status(alice, T0)).resetsAt, '2026-11-25T19:00:00.000Z');

  // 6. extend while running, expiry → FREE, MAX replaces PRO from now
  assert.equal((await billing.activate(db, alice, 'pro', new Date('2026-11-26T10:00:00Z'))).toISOString(), '2027-01-24T10:00:00.000Z');
  assert.equal((await billing.status(alice, new Date('2027-02-01T00:00:00Z'))).plan, 'free');
  assert.equal((await billing.activate(db, alice, 'max', new Date('2026-11-27T10:00:00Z'))).toISOString(), '2026-12-27T10:00:00.000Z');
  assert.equal((await billing.status(alice, new Date('2026-11-27T11:00:00Z'))).dailyTokens, 500);

  // 7. a debit failure never throws
  const broken = new BillingService({ dailyUsage: { upsert: async () => { throw new Error('db down'); } } } as never, {} as never, {} as never, {} as never);
  await broken.debit(alice, 0.01);

  // 8. paid && livemode only: a TEST payment activates nothing, a real one does (legacy business payment too)
  const pay = { id: 'p1', isTest: true, ownerType: 'business', ownerId: 'biz-x', plan: 'pro', businessId: 'biz-x' };
  await billing.onSubscriptionPaid(db, pay, T0);
  assert.equal((await billing.effectivePlan(shop, T0)).plan, 'free');
  await billing.onSubscriptionPaid(db, { ...pay, isTest: false }, T0);
  assert.equal((await billing.effectivePlan(shop, T0)).plan, 'pro');
  const legacy = { id: 'p2', isTest: false, ownerType: null, ownerId: null, plan: null, businessId: 'biz-y' };
  await billing.onSubscriptionPaid(db, legacy, T0);
  assert.equal((await billing.effectivePlan({ ownerType: 'business', ownerId: 'biz-y' }, T0)).plan, 'pro');

  // 9. subscribe: intro price once per account (only a real paid PRO uses it); MAX is the full price; ledger columns set
  const carol = { id: 'carol', role: 'user', businessId: null } as never;
  const first = await billing.subscribe(carol, { plan: 'pro' });
  assert.equal(first.amount, 1000);
  assert.equal((await billing.subscribe(carol, { plan: 'pro' })).paymentRef, first.paymentRef, 'double click = same bill');
  assert.equal((await billing.subscribe(carol, { plan: 'max' })).amount, 219000);
  const row = await db.payment.findFirst({ where: { orderId: first.paymentRef } });
  assert.deepEqual([row?.ownerType, row?.ownerId, row?.plan, row?.businessId], ['user', 'carol', 'pro', null]);
  await db.payment.create({ data: { orderId: 'sub-x', kind: 'subscription', billId: 'b-x', link: 'l', amount: 1000, status: 'paid', ownerType: 'user', ownerId: 'carol', plan: 'pro' } });
  assert.equal((await billing.subscribe(carol, { plan: 'pro' })).amount, 65000, 'second PRO month is the full price');
  await assert.rejects(billing.subscribe(carol, { plan: 'free' as never }));

  // 10. LlmClient: reads the context, stores userId/businessId, calls onCost; a failing hook never breaks the call
  const sdkQuery: SdkQuery = () =>
    (async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: '{"a":1}', total_cost_usd: 0.0042, usage: { input_tokens: 5, output_tokens: 7 } } as unknown as SDKMessage;
    })();
  const store = new MemoryStore(false);
  const seen: [string, number][] = [];
  const llm = new LlmClient({ store, sdkQuery, maxConcurrency: 2, onCost: (o, c) => void seen.push([`${o.ownerType}:${o.ownerId}`, c]) });
  const inCtx = await runWithBillingOwner(alice, () => llm.completeJson<{ a: number }>({ system: 's', prompt: 'p', model: 'haiku' }));
  assert.deepEqual(inCtx.data, { a: 1 });
  assert.deepEqual(seen, [['user:alice', 0.0042]]);
  assert.equal(store.llmCalls[0].userId, 'alice');
  await runWithBillingOwner(shop, () => llm.completeJson({ system: 's', prompt: 'p', model: 'haiku' }));
  assert.equal(store.llmCalls[1].businessId, 'biz-x');
  await llm.completeJson({ system: 's', prompt: 'p', model: 'haiku' }); // no context: no debit
  assert.equal(seen.length, 2);
  assert.equal(store.llmCalls[2].userId, undefined);
  llm.setOnCost(() => { throw new Error('hook down'); });
  await runWithBillingOwner(alice, () => llm.completeJson({ system: 's', prompt: 'p', model: 'haiku' }));
  // background work started inside the handler keeps the owner
  const bg = await runWithBillingOwner(alice, () => new Promise<string | undefined>((r) => setTimeout(() => r(currentBillingOwner()?.ownerId), 5)));
  assert.equal(bg, 'alice');

  // 11. middleware: log-only by default, 402 {ok:false,error,upgrade:true} with BILLING_ENFORCE=1, context is set for next()
  const mw = new BillingMiddleware(billing);
  const call = async (path: string, auth?: string) => {
    let status = 0;
    let body: unknown;
    let ownerInNext: string | undefined;
    const res = { status(c: number) { status = c; return this; }, json(b: unknown) { body = b; return this; } } as unknown as Response;
    const req = { originalUrl: path, headers: { authorization: auth }, body: { userId: 'dave' } } as unknown as Request;
    await mw.use(req, res, () => { ownerInNext = currentBillingOwner()?.ownerId; });
    return { status, body, ownerInNext };
  };
  let r = await call('/agent/request');
  assert.deepEqual([r.status, r.ownerInNext], [0, 'dave'], 'BILLING_ENFORCE=0: passes, context set');
  process.env.BILLING_ENFORCE = '1';
  r = await call('/agent/request');
  assert.equal(r.status, 402);
  assert.deepEqual(r.body, { ok: false, error: MSG.needProAgent, upgrade: true });
  for (const p of ['/negotiations/abc/confirm', '/tg-connect/start', '/me/tg-connect/start?x=1']) assert.equal((await call(p)).status, 402, p);
  for (const p of ['/agent/search', '/auth/login', '/tg-connect/code']) assert.equal((await call(p)).status, 0, `${p} is not gated`);
  delete process.env.BILLING_ENFORCE;

  // 12. search helpers: catalog match + qty x price, no discount
  const products = [
    { id: 'o', businessId: 'b', name: 'Osh', price: 45000, unit: 'porsiya' },
    { id: 's', businessId: 'b', name: 'Salat', price: 15000, unit: 'dona' },
  ];
  const task = { category: 'restaurant', need: 'osh', items: [{ name: 'osh', qty: 6 }] } as const;
  const m = matchProducts(task as never, products);
  assert.deepEqual(m.map((p) => p.id), ['o']);
  assert.equal(searchTotal(task as never, products, m), 270000);
  assert.equal(searchTotal(task as never, products, []), null);

  await db.$disconnect();
  process.stdout.write('billing tests passed\n');
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
