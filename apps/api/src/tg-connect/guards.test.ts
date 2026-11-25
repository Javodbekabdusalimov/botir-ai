// Run: pnpm exec tsx apps/api/src/tg-connect/guards.test.ts  (no network, fake transport)
import { strict as assert } from 'node:assert';
import { MemoryTgStore } from './memory-store';
import { ModeHandler, type DraftReply } from './modes';
import { pickChatByName } from './self-command';
import { isWithinHours, Sender, type Transport } from './sender';
import type { Chat, TgMessage } from './types';

const hours = { from: '09:00', to: '21:00' };
const DAY = new Date('2026-11-24T07:00:00Z'); // 12:00 Tashkent
const NIGHT = new Date('2026-11-24T18:30:00Z'); // 23:30 Tashkent

async function main(): Promise<void> {
  const store = new MemoryTgStore();
  let nextId = 1000;
  const sent: string[] = [];
  const transport: Transport = async (_chat, text) => {
    sent.push(text);
    return { tgMsgId: nextId++ };
  };
  const sender = new Sender(store, transport);
  const chat: Chat = { id: 'ub:1:42', accountId: 'ub:1', peerId: '42', title: 'Ali', mode: 'copilot', needsHuman: false };
  await store.upsertChat(chat);
  await store.upsertChat({ ...chat, id: 'ub:1:43', peerId: '43', title: 'Vali' });
  const inMsg: TgMessage = { id: 'ub:1:42:1', chatId: chat.id, tgMsgId: 1, direction: 'in', author: 'customer', text: 'Narxi qancha?', sentAt: DAY.toISOString() };
  await store.saveMessage(inMsg);

  assert.equal(isWithinHours(hours, DAY), true);
  assert.equal(isWithinHours(hours, NIGHT), false);
  assert.equal(isWithinHours({ from: '22:00', to: '06:00' }, NIGHT), true);

  // Guards
  assert.equal((await sender.send('ub:1', 'ub:1:999', 'hi', 'owner')).ok, false, 'unknown chat');
  assert.equal((await sender.send('ub:1', 'ub:1:43', 'hi', 'owner')).ok, false, 'peer never wrote');
  assert.equal((await sender.send('ub:1', 'ub:1:42,ub:1:43', 'hi', 'owner')).ok, false, 'bulk');
  assert.equal((await sender.send('ub:1', chat.id, '  ', 'owner')).ok, false, 'empty');
  assert.equal((await sender.send('ub:1', chat.id, 'x', 'ai', { hours, now: DAY })).ok, false, 'ai in copilot');
  const ok = await sender.send('ub:1', chat.id, 'Salom!', 'owner', { now: DAY });
  assert.ok(ok.ok && ok.message.author === 'owner');

  // Modes
  let reply: DraftReply = { text: '50 000 so\'m', confidence: 0.9, needsHuman: false };
  const modes = new ModeHandler(store, sender, async () => reply, () => hours);
  assert.equal((await modes.handleIncoming(chat, inMsg)).action, 'drafted');
  assert.equal((await store.getChat(chat.id))?.draft?.text, '50 000 so\'m');

  await modes.setMode(chat.id, 'off');
  assert.equal((await modes.handleIncoming(chat, inMsg)).action, 'ignored');

  await modes.setMode(chat.id, 'autopilot');
  const auto = await modes.handleIncoming(chat, inMsg);
  // real clock may be outside hours → either sent or needs_human with that reason
  assert.ok(auto.action === 'sent' || (auto.action === 'needs_human' && auto.reason === 'outside business hours'));

  reply = { text: 'Bilmayman', confidence: 0.5, needsHuman: false };
  const low = await modes.handleIncoming(chat, inMsg);
  assert.ok(low.action === 'needs_human' && low.reason === 'low confidence');
  assert.equal((await store.getChat(chat.id))?.needsHuman, true);

  // Night autopilot via sender directly
  const night = await sender.send('ub:1', chat.id, 'x', 'ai', { hours, now: NIGHT });
  assert.ok(!night.ok && night.reason === 'outside business hours');

  // Rate limit 20/min
  const s2 = new Sender(store, transport);
  for (let i = 0; i < 20; i++) assert.ok((await s2.send('ub:1', chat.id, `m${i}`, 'owner', { now: DAY })).ok);
  const limited = await s2.send('ub:1', chat.id, 'm20', 'owner', { now: DAY });
  assert.ok(!limited.ok && limited.reason.startsWith('rate limit'));
  assert.ok((await s2.send('ub:1', chat.id, 'later', 'owner', { now: new Date(DAY.getTime() + 61_000) })).ok);

  // Parallel sends cannot all pass the 20/min check (the slot is taken before the transport is awaited)
  const slow: Transport = async () => {
    await new Promise((r) => setTimeout(r, 5));
    return { tgMsgId: nextId++ };
  };
  const s3 = new Sender(store, slow);
  const burst = await Promise.all(Array.from({ length: 50 }, (_, i) => s3.send('ub:1', chat.id, `p${i}`, 'owner', { now: DAY })));
  assert.equal(burst.filter((r) => r.ok).length, 20, 'parallel burst respects the rate limit');
  // A failed transport gives its slot back
  const failing = new Sender(store, async () => { throw new Error('down'); });
  for (let i = 0; i < 25; i++) assert.equal((await failing.send('ub:1', chat.id, 'x', 'owner', { now: DAY })).ok, false);
  const sentAt = (failing as unknown as { sentAt: Map<string, number[]> }).sentAt.get('ub:1') ?? [];
  assert.equal(sentAt.length, 0, 'failed sends do not use rate-limit slots');

  // Autopilot with async business hours (TgService looks them up in the DB)
  await store.setChatMode(chat.id, 'autopilot');
  reply = { text: 'Ha, bor', confidence: 0.9, needsHuman: false };
  const asyncHours = new ModeHandler(store, new Sender(store, transport), async () => reply, async () => ({ from: '00:00', to: '23:59' }));
  const sentAuto = await asyncHours.handleIncoming(chat, inMsg);
  assert.ok(sentAuto.action === 'sent' || (sentAuto.action === 'needs_human' && sentAuto.reason === 'outside business hours'), JSON.stringify(sentAuto));
  const closed = new ModeHandler(store, new Sender(store, transport), async () => reply, async () => undefined);
  const closedRes = await closed.handleIncoming(chat, inMsg);
  assert.ok(closedRes.action === 'needs_human' && closedRes.reason === 'autopilot needs business hours');

  // "Aliga yoz": exact person, never a substring guess, ambiguous → nobody
  const chats = [{ title: 'Valijon (raqobatchi)' }, { title: 'Ali' }, { title: 'Aziza (namuna)' }, { title: 'Sardor Karimov' }, { title: 'Sardor Aliyev' }];
  assert.equal(pickChatByName(chats, 'Ali')?.title, 'Ali');
  assert.equal(pickChatByName(chats, 'ali')?.title, 'Ali', 'case-insensitive (Postgres contains is case-sensitive)');
  assert.equal(pickChatByName(chats, 'Aziza')?.title, 'Aziza (namuna)');
  assert.equal(pickChatByName(chats, 'Vali'), null, 'no substring match');
  assert.equal(pickChatByName(chats, 'Sardor'), null, 'two Sardors → ask for the full name');
  assert.equal(pickChatByName(chats, 'Sardor Aliyev')?.title, 'Sardor Aliyev');

  process.stdout.write('guards.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`guards.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
