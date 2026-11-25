// Run: pnpm exec tsx apps/api/src/tg-connect/first-contact.test.ts  (no network, fake transport)
import { strict as assert } from 'node:assert';
import { MemoryTgStore } from './memory-store';
import { FIRST_CONTACT_PER_DAY, Sender, type Transport } from './sender';
import type { Chat } from './types';

const NOW = new Date('2026-11-25T07:00:00Z');

async function main(): Promise<void> {
  const store = new MemoryTgStore();
  let nextId = 1;
  let fail: Error | undefined;
  const sentTo: string[] = [];
  const transport: Transport = async (chat) => {
    if (fail) throw fail;
    sentTo.push(chat.id);
    return { tgMsgId: nextId++ };
  };
  const sender = new Sender(store, transport);
  const chat = async (n: number, mode: Chat['mode'] = 'copilot'): Promise<string> => {
    const c: Chat = { id: `ub:1:${n}`, accountId: 'ub:1', peerId: String(n), title: `Biz ${n}`, mode, needsHuman: false };
    await store.upsertChat(c);
    return c.id;
  };
  const fc = (sentToday: number) => ({ now: NOW, firstContact: { sentToday } });

  // Without the flag nothing changed: no first message to a peer that never wrote.
  const a = await chat(1);
  assert.equal((await sender.send('ub:1', a, 'Salom', 'owner', { now: NOW })).ok, false);

  // Flagged + approved by the owner: allowed once.
  assert.ok((await sender.send('ub:1', a, 'Salom', 'owner', fc(0))).ok);
  // Same peer again, still no reply: not a "new peer" → refused.
  const again = await sender.send('ub:1', a, 'Hello?', 'owner', fc(1));
  assert.ok(!again.ok && again.reason.includes('wait for a reply'));

  // Cap: 5 new peers per day, the 6th is refused.
  for (let n = 2; n <= FIRST_CONTACT_PER_DAY; n++) assert.ok((await sender.send('ub:1', await chat(n), 'Salom', 'owner', fc(n - 1))).ok);
  const sixth = await sender.send('ub:1', await chat(6), 'Salom', 'owner', fc(FIRST_CONTACT_PER_DAY));
  assert.ok(!sixth.ok && sixth.reason.includes('limit'));
  assert.ok(!(await sender.send('ub:1', await chat(7), 'Salom', 'owner', { now: NOW, firstContact: { sentToday: 99 } })).ok);

  // Never autopilot / never by the AI.
  const ai = await sender.send('ub:1', await chat(8, 'autopilot'), 'Salom', 'ai', { ...fc(0), hours: { from: '00:00', to: '23:59' } });
  assert.ok(!ai.ok && ai.reason.includes('never autopilot'));
  const autoOwner = await sender.send('ub:1', await chat(9, 'autopilot'), 'Salom', 'owner', fc(0));
  assert.ok(!autoOwner.ok, 'autopilot chat is never a first-contact target');
  assert.equal(sentTo.length, FIRST_CONTACT_PER_DAY);

  // FLOOD_WAIT stops first contacts (for the wait), then they work again.
  fail = new Error('A wait of 120 seconds is required (caused by messages.SendMessage)');
  assert.ok(!(await sender.send('ub:1', await chat(10), 'Salom', 'owner', fc(0))).ok);
  fail = undefined;
  const paused = await sender.send('ub:1', await chat(11), 'Salom', 'owner', fc(0));
  assert.ok(!paused.ok && paused.reason.includes('FLOOD_WAIT'));
  assert.ok((await sender.send('ub:1', await chat(12), 'Salom', 'owner', { now: new Date(NOW.getTime() + 121_000), firstContact: { sentToday: 0 } })).ok);

  process.stdout.write('first-contact.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`first-contact.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
