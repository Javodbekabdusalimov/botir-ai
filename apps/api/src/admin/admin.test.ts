// Run: cd apps/api && pnpm exec tsx src/admin/admin.test.ts  (temp SQLite file, real Nest HTTP on a random port, no network, no claude)
import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'admin-test-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

async function main(): Promise<void> {
  execFileSync('node', ['scripts/prisma.mjs', 'db', 'push', '--skip-generate', '--accept-data-loss'], { cwd: join(__dirname, '..', '..'), env: process.env, stdio: 'pipe' });
  const { Module } = await import('@nestjs/common');
  const { NestFactory } = await import('@nestjs/core');
  const { PrismaClient } = await import('@prisma/client');
  const { AuthGuard } = await import('../auth/auth.guard');
  const { AuthService } = await import('../auth/auth.service');
  const { ApiExceptionFilter } = await import('../common/http');
  const { PrismaService } = await import('../db/prisma.service');
  const { AGENTS } = await import('../negotiations/agents.provider');
  const { ADMIN_CONTROLLERS, ADMIN_PROVIDERS } = await import('./admin.module');
  type Overview = import('@botir/shared').AdminOverview;
  type Page<T> = import('@botir/shared').AdminPage<T>;
  type Client = import('@botir/shared').AdminClient;
  type Pay = import('@botir/shared').AdminPayment;

  const db = new PrismaClient();
  for (const k of Object.keys(process.env).filter((k) => k.startsWith('PLAN_'))) delete process.env[k]; // default prices
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const user = (id: string, name: string, phone: string, extra: object = {}) =>
    db.user.create({ data: { id, name, phone, passwordHash: 'x', ...extra } });
  const admin = await user('u-admin', 'Owner', '+998901111111');
  const alice = await user('u-alice', 'Alice Karimova', '+998902222222');
  await user('u-bob', 'Bob Deleted', '+998903333333', { deletedAt: now });
  await user('u-dan', 'Dan', '+998904444444', { role: 'business', businessId: 'biz-1' });
  await db.business.create({ data: { id: 'biz-1', name: 'Dan Osh Markazi', category: 'restaurant', workHours: '{}', ownerUserId: 'u-dan' } });
  const pay = (orderId: string, data: object) =>
    db.payment.create({ data: { orderId, kind: 'subscription', billId: `bill-${orderId}`, link: 'l', amount: 1000, ...data } });
  await pay('sub-alice', { status: 'paid', paidAt: now, ownerType: 'user', ownerId: 'u-alice', plan: 'pro' });
  await pay('sub-alice-test', { amount: 82000, status: 'paid', paidAt: now, isTest: true, ownerType: 'user', ownerId: 'u-alice', plan: 'pro' });
  await pay('sub-bob', { amount: 163000, status: 'paid', paidAt: ago(40), ownerType: 'user', ownerId: 'u-bob', plan: 'max' });
  await pay('sub-dan', { status: 'pending', ownerType: 'business', ownerId: 'biz-1', plan: 'max', businessId: 'biz-1' });
  await db.planAccount.create({ data: { ownerType: 'user', ownerId: 'u-alice', plan: 'pro', expiresAt: new Date(now.getTime() + 30 * 86_400_000) } });
  await db.dailyUsage.create({ data: { ownerType: 'user', ownerId: 'u-alice', day: (await import('../billing/token-budget')).dayKey(now), tokensUsed: 43486 } });
  await db.llmCall.create({ data: { model: 'haiku', ms: 1, chars: 1, purpose: 'parser', ok: true, at: now, costUsd: 0.07, userId: 'u-alice' } });
  await db.negotiation.create({ data: { userId: 'u-alice', text: 'osh', tasks: '[]' } });

  const tokens: Record<string, typeof admin> = { admin, alice };
  let lookups = 0;
  const auth = { userFromToken: async (t: string) => (lookups++, tokens[t] ?? null) };
  @Module({
    controllers: ADMIN_CONTROLLERS,
    providers: [
      ...ADMIN_PROVIDERS, AuthGuard,
      { provide: PrismaService, useValue: db },
      { provide: AuthService, useValue: auth },
      { provide: AGENTS, useValue: { llm: { globalTokens: () => ({ used: 1234, cap: 3_000_000 }) } } },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const get = async <T>(path: string, token?: string): Promise<{ status: number; data: T }> => {
    const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = (await res.json()) as { data: T };
    return { status: res.status, data: body.data };
  };

  try {
    // 1. 401 without a token, before any user lookup; 403 for a non-admin; empty ADMIN_PHONES = nobody is admin
    process.env.ADMIN_PHONES = ' 90 111 11 11 , not-a-phone';
    for (const p of ['/admin/overview', '/admin/clients', '/admin/payments']) {
      assert.equal((await get(p)).status, 401, p);
      assert.equal((await get(p, 'garbage')).status, 401, `${p} bad token`);
      assert.equal((await get(p, 'alice')).status, 403, `${p} non-admin`);
    }
    assert.equal(lookups, 6, 'no token → no lookup');
    delete process.env.ADMIN_PHONES;
    assert.equal((await get('/admin/overview', 'admin')).status, 403, 'unset ADMIN_PHONES');
    process.env.ADMIN_PHONES = '';
    assert.equal((await get('/admin/overview', 'admin')).status, 403, 'empty ADMIN_PHONES');
    process.env.ADMIN_PHONES = '+998901111111';

    // 2. overview: real money only (TEST 82 000 excluded), paying client from a real payment, global tokens
    const o = await get<Overview>('/admin/overview', 'admin');
    assert.equal(o.status, 200);
    assert.deepEqual(o.data.revenue, { today: 1000, days30: 1000, all: 164000 }, 'deleted user money still counts as revenue, TEST never');
    assert.deepEqual([o.data.payingClients, o.data.byPlan.pro, o.data.byPlan.max], [1, 1, 0]);
    assert.deepEqual(o.data.paidSubscriptions, { intro: 1, full: 1 });
    assert.equal(o.data.testPaymentsPaid, 1);
    assert.deepEqual([o.data.users.total, o.data.businesses, o.data.negotiations.today], [3, 1, 1], 'soft-deleted user not counted');
    assert.deepEqual(o.data.globalTokens, { usedToday: 1234, cap: 3_000_000 });
    assert.equal(o.data.aiCostUsd.today, 0.07);

    // 3. clients: alice (paid row) and the business; deleted bob hidden; search + plan filter
    const c = await get<Page<Client>>('/admin/clients', 'admin');
    const names = c.data.rows.map((r) => r.name);
    assert.ok(!names.includes('Bob Deleted'), 'soft-deleted user hidden');
    assert.ok(!names.includes('Dan'), 'business owner is listed as the business');
    const a = c.data.rows.find((r) => r.ownerId === 'u-alice');
    assert.deepEqual(
      [a?.plan, a?.active, a?.introUsed, a?.totalPaid, a?.paymentsCount, a?.tokensToday, a?.negotiations30d, a?.aiCostUsd30d],
      ['pro', true, true, 1000, 1, 43486, 1, 0.07],
    );
    const biz = c.data.rows.find((r) => r.ownerType === 'business');
    assert.deepEqual([biz?.name, biz?.phone, biz?.plan, biz?.totalPaid], ['Dan Osh Markazi', '+998904444444', 'free', 0]);
    assert.deepEqual((await get<Page<Client>>('/admin/clients?q=karim', 'admin')).data.rows.map((r) => r.ownerId), ['u-alice']);
    assert.deepEqual((await get<Page<Client>>('/admin/clients?q=90%20444', 'admin')).data.rows.map((r) => r.ownerId), ['biz-1']);
    assert.deepEqual((await get<Page<Client>>('/admin/clients?plan=pro', 'admin')).data.rows.map((r) => r.ownerId), ['u-alice']);

    // 4. payments: newest first, TEST rows listed and flagged, filters, payer names (deleted payer → no name)
    const p = await get<Page<Pay>>('/admin/payments', 'admin');
    assert.equal(p.data.total, 4);
    const testRow = p.data.rows.find((r) => r.orderId === 'sub-alice-test');
    assert.deepEqual([testRow?.isTest, testRow?.payer?.name], [true, 'Alice Karimova']);
    assert.equal(p.data.rows.find((r) => r.orderId === 'sub-bob')?.payer?.name, null);
    assert.deepEqual([p.data.rows.find((r) => r.orderId === 'sub-dan')?.business?.name, p.data.rows.find((r) => r.orderId === 'sub-dan')?.payer?.phone], ['Dan Osh Markazi', '+998904444444']);
    const real = await get<Page<Pay>>('/admin/payments?test=real&status=paid', 'admin');
    assert.deepEqual(real.data.rows.map((r) => r.orderId).sort(), ['sub-alice', 'sub-bob']);
    assert.deepEqual((await get<Page<Pay>>('/admin/payments?test=test', 'admin')).data.rows.map((r) => r.orderId), ['sub-alice-test']);
    assert.deepEqual((await get<Page<Pay>>('/admin/payments?q=osh&limit=1', 'admin')).data, { total: 1, rows: [p.data.rows.find((r) => r.orderId === 'sub-dan')] });
  } finally {
    await app.close();
    await db.$disconnect();
  }
  process.stdout.write('admin tests passed\n');
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
