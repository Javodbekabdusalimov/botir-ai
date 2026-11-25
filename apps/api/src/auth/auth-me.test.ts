// Run: pnpm exec tsx apps/api/src/auth/auth-me.test.ts  (temp SQLite file, no network, no LLM)
// GET /auth/me shows the plan from the billing ledger (PlanAccount, same as /billing/me), never from Business.plan.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'auth-me-test-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

async function main(): Promise<void> {
  const apiDir = join(__dirname, '..', '..');
  execFileSync('node', ['scripts/prisma.mjs', 'db', 'push', '--skip-generate', '--accept-data-loss'], { cwd: apiDir, env: process.env, stdio: 'pipe' });
  const { PrismaClient } = await import('@prisma/client');
  const { BillingService } = await import('../billing/billing.service');
  const { AuthController } = await import('./auth.controller');

  const db = new PrismaClient();
  const billing = new BillingService(db as never, {} as never, {} as never, {} as never);
  const controller = new AuthController(db as never, {} as never, billing);
  const DAY = 86_400_000;

  const biz = await db.business.create({ data: { id: 'biz-me', name: 'Me Kafe', category: 'restaurant', workHours: '', aiCredits: 7 } });
  const owner = await db.user.create({ data: { name: 'Egasi', phone: '+998900000011', passwordHash: 'x', role: 'business', businessId: biz.id } });
  const client = await db.user.create({ data: { name: 'Mijoz', phone: '+998900000012', passwordHash: 'x', role: 'user' } });
  const me = async (u: typeof owner) => (await controller.me(u)).data;
  const setPlan = (plan: string, expiresAt: Date) =>
    db.planAccount.upsert({
      where: { ownerType_ownerId: { ownerType: 'business', ownerId: biz.id } },
      create: { ownerType: 'business', ownerId: biz.id, plan, expiresAt },
      update: { plan, expiresAt },
    });

  // No PlanAccount row → free, even if the legacy Business.plan column says pro.
  await db.business.update({ where: { id: biz.id }, data: { plan: 'pro', planUntil: new Date(Date.now() + 10 * DAY) } });
  assert.deepEqual((await me(owner)).business, { id: biz.id, name: 'Me Kafe', plan: 'free', planUntil: null, aiCredits: 7 });

  // PlanAccount pro / max until a future date → shown with that date (what /billing/me says).
  const until = new Date(Date.now() + 30 * DAY);
  await setPlan('pro', until);
  assert.equal((await me(owner)).business?.plan, 'pro');
  assert.equal((await me(owner)).business?.planUntil, until.toISOString());
  assert.equal((await me(owner)).business?.plan, (await billing.status({ ownerType: 'business', ownerId: biz.id })).plan);
  await setPlan('max', until);
  assert.equal((await me(owner)).business?.plan, 'max');

  // Expired → free.
  await setPlan('pro', new Date(Date.now() - DAY));
  assert.equal((await me(owner)).business?.plan, 'free');

  // Response shape unchanged: a plain client has no business block.
  const plain = await me(client);
  assert.equal(plain.business, undefined);
  assert.equal(plain.businessId, undefined);
  assert.equal(plain.user.id, client.id);

  await db.$disconnect();
  process.stdout.write('auth-me tests passed\n');
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
