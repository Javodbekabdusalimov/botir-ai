// Run (empty throwaway DB, no network, fake LLM, fake payment links):
//   cd apps/api && rm -f prisma/negotiation-core-test.db && DATABASE_URL=file:./negotiation-core-test.db pnpm exec prisma db push --skip-generate
//   DATABASE_URL=file:./negotiation-core-test.db pnpm exec tsx src/negotiations/negotiations.test.ts
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, UnauthorizedException,
} from '@nestjs/common';
import { lastValueFrom, toArray } from 'rxjs';
import type { NegotiationEvent } from '@botir/shared';
import { createAgents, LlmError, type Agents } from '../agents';
import { toAgentBusiness } from '../db/mappers';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { MetricsService } from '../knowledge/metrics.service';
import { QuestionsService } from '../knowledge/questions.service';
import { TurnRecorder } from '../knowledge/turn-recorder.service';
import type { PaymentLinkProvider } from '../payments/payment-link';
import { OrderExistsError } from './confirm-rules';
import { NegotiationsService } from './negotiations.service';

const db = new PrismaService();
const store = new PrismaAgentStore(db);
const turns = new TurnRecorder(db, new QuestionsService(db, new MetricsService(db)));
const payments: PaymentLinkProvider = { createPaymentLink: async (o) => ({ payUrl: `https://pay.test/${o.id}`, billId: o.id }) };

type LlmInput = { purpose?: string };
/** Agents with a scripted LLM: no network, every call answered by `script` (throw = AI failure). */
function fakeAgents(script: (i: LlmInput) => unknown): Agents {
  const agents = createAgents({ store });
  agents.llm.completeJson = (async (i: LlmInput) => ({ data: script(i), ms: 1 })) as unknown as typeof agents.llm.completeJson;
  return agents;
}
const service = (agents: Agents): NegotiationsService => new NegotiationsService(db, agents, payments, store, turns);
const noLlm = (): never => { throw new Error('LLM must not be called'); };

const isHttp = (status: number) => (e: unknown): boolean => e instanceof HttpException && e.getStatus() === status;

async function business(name: string) {
  const b = await db.business.create({ data: { name, category: 'restaurant', workHours: '', maxDiscountPct: 10 } });
  const item = await db.catalogItem.create({ data: { businessId: b.id, name: 'Osh (porsiya)', price: 45000 } });
  return { id: b.id, itemId: item.id };
}

/** A finished negotiation with one proposed offer per business, all for task 0. */
async function finished(status: string, businessIds: string[], opts: { userId?: string; ageMin?: number } = {}) {
  const neg = await db.negotiation.create({ data: { userId: opts.userId ?? 'guest-1', text: 'osh', tasks: '[]', status } });
  const taskId = `${neg.id}:0`;
  const task = { taskId, category: 'restaurant', need: 'osh', when: 'ertaga 18:00', people: 6, wishes: 'piyozsiz' };
  await db.negotiation.update({ where: { id: neg.id }, data: { tasks: JSON.stringify([task]), status } });
  const createdAt = new Date(Date.now() - (opts.ageMin ?? 1) * 60_000);
  for (const businessId of businessIds) {
    const item = await db.catalogItem.findFirstOrThrow({ where: { businessId } });
    await db.agentOffer.create({
      data: {
        id: randomUUID(), sessionId: `${neg.id}:${businessId}`, negotiationId: neg.id, businessId, taskId, status: 'proposed', createdAt,
        items: JSON.stringify([{ productId: item.id, qty: 6 }]), total: 256500, discountPct: 5,
      },
    });
  }
  return { negId: neg.id, taskId };
}

async function confirmTests(): Promise<void> {
  const svc = service(fakeAgents(noLlm));
  const a = await business('A');

  // Parallel "Tasdiqlayman" × 8 → exactly one order, the rest 409 (never a 500, never two orders).
  const { negId } = await finished('agreed', [a.id]);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => svc.confirm(negId, a.id)));
  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
  assert.equal(won.length, 1, 'one confirm wins');
  assert.ok(lost.every((e) => e instanceof ConflictException), `losers get 409: ${lost.map(String).join(' | ')}`);
  assert.equal(await db.order.count({ where: { negotiationId: negId } }), 1, 'one order');
  const order = await db.order.findFirstOrThrow({ where: { negotiationId: negId } });
  assert.deepEqual(JSON.parse(order.details ?? '{}'), { when: 'ertaga 18:00', people: 6, wishes: 'piyozsiz' });
  assert.equal((await db.negotiation.findUniqueOrThrow({ where: { id: negId } })).status, 'confirmed');
  // A later confirm is idempotent: 409 with the existing order id and its payment link.
  await assert.rejects(svc.confirm(negId, a.id), (e) =>
    e instanceof OrderExistsError && e.orderId === order.id && e.paymentLink === `https://pay.test/${order.id}`);

  // Only an agreed negotiation can be confirmed; nothing is created otherwise.
  for (const status of ['rejected', 'failed', 'running']) {
    const n = await finished(status, [a.id]);
    await assert.rejects(svc.confirm(n.negId, a.id), (e) => e instanceof ConflictException, status);
    assert.equal(await db.order.count({ where: { negotiationId: n.negId } }), 0, `${status}: no order`);
  }
  // The offer card says "valid 30 min": an older offer is gone.
  const old = await finished('agreed', [a.id], { ageMin: 31 });
  await assert.rejects(svc.confirm(old.negId, a.id), (e) => e instanceof GoneException);
  // A business without a kept offer cannot be confirmed.
  await assert.rejects(svc.confirm(negId, 'other-biz'), (e) => e instanceof ConflictException);

  // One business per task: after A is confirmed, B (same task) is refused.
  const b = await business('B');
  const two = await finished('agreed', [a.id, b.id]);
  await svc.confirm(two.negId, a.id);
  await assert.rejects(svc.confirm(two.negId, b.id), (e) => e instanceof ConflictException && /boshqa biznes/.test(e.message));
  assert.equal(await db.order.count({ where: { negotiationId: two.negId } }), 1);

  // A registered user's negotiation: 401 without a token, 403 for someone else, OK for the owner.
  const user = await db.user.create({ data: { name: 'U', phone: `+99890${Date.now() % 10_000_000}`, passwordHash: 'x', role: 'user' } });
  const own = await finished('agreed', [a.id], { userId: user.id });
  await assert.rejects(svc.get(own.negId), (e) => e instanceof UnauthorizedException);
  await assert.rejects(svc.get(own.negId, 'someone-else'), (e) => e instanceof ForbiddenException);
  await assert.rejects(svc.confirm(own.negId, a.id), (e) => e instanceof UnauthorizedException);
  await assert.rejects(svc.confirm(own.negId, a.id, { viewerId: 'someone-else' }), (e) => e instanceof ForbiddenException);
  assert.equal((await svc.get(own.negId, user.id)).id, own.negId);
  assert.ok((await svc.confirm(own.negId, a.id, { viewerId: user.id })).orderId);
}

async function limitTests(): Promise<void> {
  process.env.AGENT_RATE_LIMIT = '2';
  const agents = fakeAgents(noLlm);
  const districts: Array<string | undefined> = [];
  agents.personalAgent.parse = async (_text, _memory, district) => { districts.push(district); return []; }; // no AI call
  const svc = service(agents);
  delete process.env.AGENT_RATE_LIMIT;

  await assert.rejects(svc.request('guest-l', 'x'.repeat(501), '10.0.0.1'), (e) => e instanceof BadRequestException);
  await assert.rejects(svc.request('guest-l', '   ', '10.0.0.1'), (e) => e instanceof BadRequestException);
  await svc.request('guest-l', 'osh kerak', '10.0.0.1');
  await svc.request('guest-l', 'osh kerak', '10.0.0.1');
  await assert.rejects(svc.request('guest-l', 'osh kerak', '10.0.0.1'), isHttp(429), 'per IP and user');
  await assert.rejects(svc.request('guest-other', 'osh kerak', '10.0.0.1'), isHttp(429), 'same IP, other guest id');
  await assert.rejects(svc.request('guest-l', 'osh kerak', '10.0.0.2'), isHttp(429), 'same user, other IP');
  const { negotiationId } = await svc.request('guest-new', 'osh kerak', '10.0.0.3', 'Chilonzor');
  await lastValueFrom(svc.stream(negotiationId).pipe(toArray()));
  assert.equal(districts.at(-1), 'Chilonzor', 'UI district reaches parse; others are not blocked');

  process.env.AGENT_DAILY_CAP = '1';
  const capped = service(agents);
  delete process.env.AGENT_DAILY_CAP;
  await assert.rejects(capped.request('guest-cap', 'osh kerak', '10.0.0.9'), (e) => isHttp(429)(e) && /Bugungi/.test(String(e)));
}

/** Runs one request through the real negotiator with a scripted LLM (gets the catalog item id) and returns all SSE events. */
async function negotiate(script: (i: LlmInput, round: number, itemId: string) => unknown) {
  const biz = await business(`L-${Math.random()}`);
  let round = 0;
  const agents = fakeAgents((i) => {
    if (i.purpose === 'business_agent') round++;
    return script(i, round, biz.itemId);
  });
  agents.personalAgent.parse = async () => [{ category: 'restaurant', need: 'osh', people: 6, items: [{ name: 'osh', qty: 6 }] }];
  agents.personalAgent.findBusinesses = async () => [toAgentBusiness(await db.business.findUniqueOrThrow({ where: { id: biz.id } }))];
  const svc = service(agents);
  const { negotiationId } = await svc.request(`guest-${Math.random()}`, 'osh kerak', `10.1.${Math.random()}`);
  const events = await lastValueFrom(svc.stream(negotiationId).pipe(toArray()));
  const neg = await db.negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
  return { svc, biz, negotiationId, events, status: neg.status, rounds: round };
}
const errors = (events: NegotiationEvent[]): string[] => events.flatMap((e) => (e.type === 'error' ? [e.error] : []));
const bestOffers = (events: NegotiationEvent[]) => events.flatMap((e) => (e.type === 'best_offer' ? [e] : []));
const offer = (itemId: string) => ({ reply: 'Osh 6 porsiya', offer: { items: [{ productId: itemId, qty: 6 }], discountPct: 5 }, confidence: 0.9 });

async function laneTests(): Promise<void> {
  // 1) AI fails in round 1, no offer yet → 'failed' (never 'rejected'), only the safe Uzbek text, no raw detail.
  const failed = await negotiate(() => { throw new LlmError('limit', 'raw provider text 429'); });
  assert.equal(failed.status, 'failed');
  assert.ok(errors(failed.events).some((e) => e.includes('AI hozir javob bera olmadi')), errors(failed.events).join(' | '));
  assert.ok(!JSON.stringify(failed.events).includes('raw provider text'), 'raw LLM detail never reaches the client');

  // 2) A valid offer in round 1, AI fails in round 2 → offer kept: 'agreed', best_offer with taskId, confirmable.
  const kept = await negotiate((i, round, itemId) => {
    if (i.purpose === 'personal_agent') return { action: 'counter', message: 'chegirma bormi?' };
    if (round >= 2) throw new LlmError('overloaded', 'raw');
    return offer(itemId);
  });
  assert.equal(kept.status, 'agreed', errors(kept.events).join(' | '));
  const best = bestOffers(kept.events);
  assert.equal(best.length, 1);
  assert.equal(best[0].taskId, `${kept.negotiationId}:0`, 'best_offer carries the task id');
  assert.ok(errors(kept.events).some((e) => e.includes('taklif saqlandi')));
  assert.ok((await kept.svc.confirm(kept.negotiationId, kept.biz.id, { taskId: best[0].taskId })).orderId);

  // 3) The same unknown question twice in a row → stop honestly, no 3rd round, the earlier valid offer kept.
  const unanswered = await negotiate((i, _round, itemId) => {
    if (i.purpose === 'personal_agent') return { action: 'counter', message: 'parking bormi?' };
    return { ...offer(itemId), unknownQuestion: 'Parking bormi?' };
  });
  assert.equal(unanswered.rounds, 2, 'no extra LLM rounds');
  assert.ok(errors(unanswered.events).some((e) => e.includes('biznes bu savolga javob bera olmadi')));
  assert.equal(unanswered.status, 'agreed', 'earlier valid offer is kept');

  // 4) Same question twice, but the offer misses what the client asked (1 portion of 6) → nothing kept → 'rejected'.
  const short = await negotiate((i, _round, itemId) => {
    if (i.purpose === 'personal_agent') return { action: 'counter', message: 'parking bormi?' };
    return { reply: 'r', offer: { items: [{ productId: itemId, qty: 1 }], discountPct: 0 }, confidence: 0.9, unknownQuestion: 'Parking bormi?' };
  });
  assert.equal(short.status, 'rejected');
  assert.equal(bestOffers(short.events).length, 0);
}

async function staleTest(): Promise<void> {
  const neg = await db.negotiation.create({
    data: { userId: 'guest-s', text: 'x', tasks: '[]', status: 'running', createdAt: new Date(Date.now() - 11 * 60_000) },
  });
  const fresh = await db.negotiation.create({ data: { userId: 'guest-s', text: 'x', tasks: '[]', status: 'running' } });
  await service(fakeAgents(noLlm)).onModuleInit();
  assert.equal((await db.negotiation.findUniqueOrThrow({ where: { id: neg.id } })).status, 'failed');
  assert.equal((await db.negotiation.findUniqueOrThrow({ where: { id: fresh.id } })).status, 'running');
}

async function main(): Promise<void> {
  await confirmTests();
  await limitTests();
  await laneTests();
  await staleTest();
  process.stdout.write('negotiations tests passed\n');
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
