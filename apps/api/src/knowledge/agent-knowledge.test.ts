// Run (empty throwaway DB, no network, fake LLM and fake Telegram):
//   cd apps/api && rm -f prisma/agent-test.db && DATABASE_URL=file:./agent-test.db pnpm exec prisma db push --skip-generate
//   DATABASE_URL=file:./agent-test.db pnpm exec tsx src/knowledge/agent-knowledge.test.ts
import { strict as assert } from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import { createAgents, findWrongPrice } from '../agents';
import { toAgentBusiness } from '../db/mappers';
import { PrismaAgentStore } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { createBot } from '../telegram-bot/bot';
import { TgController } from '../tg/tg.controller';
import { TgService, type TgOwner } from '../tg/tg.service';
import { renderKnowledge } from './knowledge-context';
import { MetricsService } from './metrics.service';
import { cleanQuestion, normalizeQuestion, QuestionsService } from './questions.service';
import { topicOf } from './topics';
import { TurnRecorder } from './turn-recorder.service';

const db = new PrismaService();
const metrics = new MetricsService(db);
const questions = new QuestionsService(db, metrics);
const turns = new TurnRecorder(db, questions);
const store = new PrismaAgentStore(db);

const biz = async (name: string, category = 'restaurant') =>
  (await db.business.create({ data: { name, category, workHours: '', maxDiscountPct: 10 } })).id;
const fact = (businessId: string, kind: string, content: string, status = 'confirmed', extra: { deletedAt?: Date; topic?: string } = {}) =>
  db.knowledgeFact.create({ data: { businessId, sourceId: 's', kind, topic: 'delivery', content, status, confirmedAt: new Date(), ...extra } });
const rejects = (p: Promise<unknown>, type: typeof NotFoundException | typeof ConflictException) => assert.rejects(p, (e) => e instanceof type);

async function contextTest(): Promise<void> {
  const [a, b] = [await biz('A'), await biz('B')];
  await fact(a, 'policy', 'A-POLICY 15 000');
  await fact(a, 'policy', 'A-DRAFT', 'draft');
  await fact(a, 'policy', 'A-REJECTED', 'rejected');
  await fact(a, 'policy', 'A-DELETED', 'confirmed', { deletedAt: new Date() });
  await fact(a, 'catalog', 'A-CATALOG');
  await fact(b, 'faq', 'B-FAQ');
  await db.catalogItem.create({ data: { businessId: a, name: 'Somsa', price: 8000, inStock: false } });
  const [ka, kb] = [await store.getKnowledge(a), await store.getKnowledge(b)];
  assert.ok(ka.includes('A-POLICY') && ka.includes('Somsa'));
  for (const hidden of ['A-DRAFT', 'A-REJECTED', 'A-DELETED', 'A-CATALOG', 'B-FAQ']) assert.ok(!ka.includes(hidden), hidden);
  assert.ok(kb.includes('B-FAQ') && !kb.includes('A-'));

  const big = renderKnowledge({ facts: Array.from({ length: 300 }, (_, i) => ({ kind: 'faq', topic: 't', question: `S${i}?`, content: 'x\n'.repeat(100) })), outOfStock: [] });
  assert.ok(big.length < 4000 && big.includes('S0?') && !big.includes('S299?'));
  assert.equal(renderKnowledge({ facts: [], outOfStock: [] }), '');
  assert.equal(findWrongPrice("Yetkazish 15 000 so'm", [], undefined, ka), undefined);
  assert.equal(findWrongPrice("Yetkazish 17 000 so'm", [], undefined, ka), 17000);
}

async function questionsTest(): Promise<void> {
  assert.equal(normalizeQuestion('  Sizda PARKING bormi?! '), 'parking bormi');
  assert.equal(normalizeQuestion("To‘lov qanday?"), normalizeQuestion("to'lov qanday"));
  assert.ok(!cleanQuestion('Menga +998 90 123 45 67 ga qo‘ng‘iroq qilasizmi?').includes('123'));
  assert.equal(topicOf('Parking bormi?'), 'parking');

  const a = await biz('Q');
  await Promise.all([questions.record(a, 'Parking bormi?'), questions.record(a, 'parking bormi'), questions.record(a, 'Sizda parking bormi??')]);
  let [q] = await questions.list(a);
  assert.equal((await questions.list(a)).length, 1);
  assert.equal(q.timesAsked, 3);
  const other = await biz('Q2');
  assert.equal((await questions.list(other)).length, 0);
  await rejects(questions.answer(other, q.id, 'x'), NotFoundException);
  await rejects(questions.dismiss(other, q.id), NotFoundException);

  const done = await questions.answer(a, q.id, ' Ha, 20 ta mashinaga bepul ');
  assert.equal(done.status, 'answered');
  await rejects(questions.answer(a, q.id, 'boshqa'), ConflictException);
  const f = await db.knowledgeFact.findFirstOrThrow({ where: { businessId: a, kind: 'faq' } });
  assert.deepEqual([f.status, f.topic, f.content], ['confirmed', 'parking', 'Ha, 20 ta mashinaga bepul']);
  assert.equal((await db.knowledgeSource.findUniqueOrThrow({ where: { id: f.sourceId } })).kind, 'question');
  assert.ok((await store.getKnowledge(a)).includes('20 ta mashinaga'));
  await questions.record(a, 'Parking bormi?');
  [q] = await questions.list(a);
  assert.deepEqual([q.status, q.timesAsked], ['answered', 4]);
  await db.knowledgeFact.update({ where: { id: f.id }, data: { status: 'rejected' } }); // owner withdrew the answer
  await questions.record(a, 'Parking bormi?');
  [q] = await questions.list(a);
  assert.deepEqual([q.status, q.answer], ['open', undefined]);
  await questions.dismiss(a, q.id);
  await questions.record(a, 'Parking bormi?');
  [q] = await questions.list(a);
  assert.deepEqual([q.status, q.timesAsked], ['dismissed', 6]);
}

async function notifyTest(): Promise<void> {
  const a = await biz('N');
  const sent: string[] = [];
  questions.setNotifier(async (_id, text) => ({ chatId: '555', messageId: 9000 + sent.push(text) }));
  for (let i = 0; i < 12; i++) await questions.record(a, `Savol raqam ${i} qanday?`);
  await questions.record(a, 'Savol raqam 0 qanday?');
  assert.equal(sent.length, 10, 'max 10 per hour, max 1 per question');

  // Bot: real grammY handlers, fake API (no network).
  await db.tgAccount.create({ data: { id: 'n1', businessId: a, kind: 'userbot', tgUserId: '555', connectedAt: new Date() } });
  const replies: string[] = [];
  const personal: string[] = [];
  const { bot } = createBot({
    token: '1:fake', store: undefined as never, sender: undefined as never, onIncoming: async () => undefined,
    personalAgent: async (_id, t) => { personal.push(t); return 'ok'; },
    resolveContact: async () => null, confirmOffer: async () => '',
    answerQuestion: (chatId, messageId, text) => questions.answerByReply(String(chatId), messageId, text),
  });
  assert.ok(bot);
  bot.botInfo = { id: 1, is_bot: true, first_name: 'b', username: 'b_bot' } as typeof bot.botInfo;
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === 'sendMessage') replies.push(String((payload as { text?: string }).text));
    return { ok: true, result: true } as never;
  });
  let update = 0;
  const say = (chatId: number, text: string, replyTo?: number) => {
    const chat = { id: chatId, type: 'private' as const, first_name: 'x' };
    const date = 1;
    return bot.handleUpdate({
      update_id: ++update,
      message: {
        message_id: 100 + update, date, chat, from: { id: chatId, is_bot: false, first_name: 'x' }, text,
        ...(replyTo ? { reply_to_message: { message_id: replyTo, date, chat, text: 'q', reply_to_message: undefined } } : {}),
      },
    } as Parameters<typeof bot.handleUpdate>[0]);
  };
  const first = async () => (await questions.list(a)).find((x) => x.question === 'Savol raqam 0 qanday?');
  await say(777, 'begona javob', 9001); // other chat, same message id
  await say(555, 'reply emas');
  await say(555, 'boshqa xabarga', 42);
  assert.equal((await first())?.status, 'open');
  assert.deepEqual(personal, ['begona javob', 'reply emas', 'boshqa xabarga']);
  await say(555, 'Mana javob', 9001);
  assert.deepEqual([(await first())?.status, (await first())?.answer], ['answered', 'Mana javob']);
  assert.ok(replies.at(-1)?.startsWith('✅'));
  await say(555, 'ikkinchi', 9001);
  assert.ok(replies.at(-1)?.includes('allaqachon'));
  await db.tgAccount.update({ where: { id: 'n1' }, data: { deletedAt: new Date() } }); // disconnected → no longer trusted
  await say(555, 'eski egasi', 9002);
  assert.equal((await db.pendingQuestion.findFirstOrThrow({ where: { businessId: a, tgMessageId: 9002 } })).status, 'open');
  assert.equal(personal.length, 3, 'answers never start a negotiation');
  questions.setNotifier(async () => { throw new Error('telegram down'); });
  await questions.record(a, 'Xato bo‘lsa ham yoziladimi?');
}

async function agentTest(): Promise<void> {
  const a = await biz('AG');
  await db.catalogItem.create({ data: { businessId: a, name: 'Osh', price: 45000, description: 'Laganda' } });
  await fact(a, 'policy', 'AG-FACT');
  await db.goldenCase.create({ data: { id: `g-${a}`, businessId: a, question: 'Parking bormi?', expected: '[]' } });
  const item = await db.catalogItem.findFirstOrThrow({ where: { businessId: a } });
  const agents = createAgents({ store });
  const systems: string[] = [];
  let unknown: unknown = 'Parking bormi?';
  const reply = (i: { purpose?: string; system: string }) => {
    systems.push(i.system);
    if (i.purpose === 'personal_agent') return { action: 'accept', message: 'ok' };
    if (i.purpose === 'eval_judge') return { pass: true, reason: '' };
    return { reply: 'r', offer: { items: [{ productId: item.id, qty: 2 }], discountPct: 99 }, confidence: 0.9, unknownQuestion: unknown };
  };
  agents.llm.completeJson = (async (i: { purpose?: string; system: string }) => ({ data: reply(i), ms: 1 })) as unknown as typeof agents.llm.completeJson;

  await agents.evaluator.evaluate(a, '');
  assert.ok(systems.every((s) => s.includes('AG-FACT')), 'evaluator agent and judge see the facts');
  assert.equal(await db.agentTurn.count({ where: { businessId: a } }), 0, 'evaluation records no turns');
  assert.equal(await db.pendingQuestion.count({ where: { businessId: a } }), 0, 'evaluation records no questions');
  assert.equal((await metrics.forBusiness(a)).aiAnsweredPct, null);

  const business = toAgentBusiness(await db.business.findUniqueOrThrow({ where: { id: a } }));
  const run = () => agents.negotiator.run({
    userId: 'u', business, task: { category: 'restaurant', need: 'osh' }, lang: 'uz', onTurn: turns.session(a, 'negotiation'),
  });
  const r = await run();
  assert.deepEqual([r.status, r.offer?.total, r.offer?.discountPct], ['agreed', 81000, 10], 'PolicyGuard unchanged');
  assert.ok(systems.some((s) => s.includes('| Laganda')));
  for (const u of ['null', null, 42]) { unknown = u; await run(); }
  await new Promise((res) => setTimeout(res, 300));
  const m = await metrics.forBusiness(a);
  assert.deepEqual([m.aiTurns, m.aiAnsweredPct], [4, 75]);
  assert.equal((await questions.list(a))[0]?.timesAsked, 1);
  assert.deepEqual(m.missingTopics, ['profile', 'payment', 'booking']);

  const rec = turns.session(a, 'negotiation');
  for (const q of ['Wi-Fi bormi?', 'wi-fi bormi', 'Zalda tekin Wi-Fi bormi, tezmi?']) rec({ confidence: 1, unknownQuestion: q });
  await turns.record(a, 'inbox', { confidence: 0.4 });
  await turns.record(a, 'inbox', { confidence: 0.9, needsHuman: true });
  await new Promise((res) => setTimeout(res, 300));
  assert.equal((await questions.list(a)).find((q) => q.question === 'Wi-Fi bormi?')?.timesAsked, 1, 'one conversation = one ask');
  assert.equal((await questions.list(a)).length, 2);
  assert.deepEqual([(await metrics.forBusiness(a)).aiTurns, (await metrics.forBusiness(a)).aiAnsweredPct], [9, 33]);

  // Best effort: a broken recorder never breaks a negotiation.
  const broken = new TurnRecorder({ agentTurn: { create: async () => { throw new Error('db down'); } } } as unknown as PrismaService, questions);
  const ok = await agents.negotiator.run({ userId: 'u', business, task: { category: 'restaurant', need: 'osh' }, lang: 'uz', onTurn: broken.session(a, 'negotiation') });
  assert.equal(ok.status, 'agreed');
}

async function readyTest(): Promise<void> {
  const a = await biz('R');
  await metrics.touchReady(a);
  await db.catalogItem.create({ data: { businessId: a, name: 'X', price: 1 } });
  await fact(a, 'profile', 'draft', 'draft');
  await metrics.touchReady(a);
  assert.equal((await metrics.forBusiness(a)).minutesToReady, null);
  await fact(a, 'profile', 'ok');
  await metrics.touchReady(a);
  const at = (await db.business.findUniqueOrThrow({ where: { id: a } })).agentReadyAt;
  assert.ok(at);
  await metrics.touchReady(a);
  assert.deepEqual((await db.business.findUniqueOrThrow({ where: { id: a } })).agentReadyAt, at, 'set once');
  await db.business.update({ where: { id: a }, data: { createdAt: new Date(at.getTime() - 7 * 60_000) } });
  assert.equal((await metrics.forBusiness(a)).minutesToReady, 7);
}

async function loginTest(): Promise<void> {
  const a = await biz('L');
  const owner = { id: 'own', businessId: a } as DbUser;
  const foreign = { id: 'x', businessId: await biz('L2') } as DbUser;
  const tg = new TgService(db, undefined as never, undefined as never, undefined as never, questions, turns);
  const submitted: string[] = [];
  const priv = tg as unknown as { login: { submitCode(id: string): Promise<{ status: string }> }; loginOwner: Map<string, TgOwner> };
  priv.login = { submitCode: async (id) => { submitted.push(id); return { status: 'need_password' }; } };
  priv.loginOwner.set('biz-login', { type: 'business', id: a }).set('me-login', { type: 'user', id: 'x' });
  const c = new TgController(tg, db);
  const code = (loginId: string, user: DbUser) => c.code({ loginId, code: '1' }, user);
  await rejects(code('biz-login', foreign), NotFoundException);
  await rejects(code('me-login', foreign), NotFoundException);
  await rejects(code('unknown', owner), NotFoundException);
  assert.deepEqual(submitted, [], 'no code attempt reaches Telegram');
  assert.deepEqual(await code('biz-login', owner), { ok: true, data: { status: 'need_password' } });
  assert.deepEqual(submitted, ['biz-login']);
}

async function main(): Promise<void> {
  for (const t of [contextTest, questionsTest, notifyTest, agentTest, readyTest, loginTest]) {
    await t();
    process.stdout.write(`${t.name}: OK\n`);
  }
  await db.$disconnect();
}

main().catch((e: unknown) => {
  process.stderr.write(`agent-knowledge.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
