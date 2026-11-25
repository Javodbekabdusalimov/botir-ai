// Run: pnpm exec tsx apps/api/src/tg-connect/user-connect.test.ts  (no network, fake sender)
import { strict as assert } from 'node:assert';
import { parseSelfCommand } from './self-command';
import { ActionGate, type ActionSend, type ActionStore, type TgAction } from './user-actions';

class MemoryActionStore implements ActionStore {
  readonly rows = new Map<string, TgAction>();
  private n = 0;
  async create(a: Parameters<ActionStore['create']>[0]): Promise<TgAction> {
    const row: TgAction = { ...a, id: `a${++this.n}`, status: 'pending', createdAt: new Date(Date.now() + this.n).toISOString() };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? { ...r } : undefined;
  }
  async listPending(userId: string) {
    return [...this.rows.values()].filter((r) => r.userId === userId && r.status === 'pending').reverse();
  }
  async claim(id: string) {
    const r = this.rows.get(id);
    if (r?.status !== 'pending') return false;
    r.status = 'sending';
    return true;
  }
  async finish(id: string, status: 'sent' | 'rejected' | 'failed', reason?: string) {
    const r = this.rows.get(id);
    if (r) Object.assign(r, { status, reason });
  }
}

async function main(): Promise<void> {
  // ---- Saved Messages parser ----
  assert.deepEqual(parseSelfCommand('Botir, ertaga 18:00 ga 6 kishilik osh band qil'), {
    kind: 'request', text: 'ertaga 18:00 ga 6 kishilik osh band qil',
  });
  assert.deepEqual(parseSelfCommand('botir: moy almashtirish kerak'), { kind: 'request', text: 'moy almashtirish kerak' });
  assert.deepEqual(parseSelfCommand('@Botir osh'), { kind: 'request', text: 'osh' });
  assert.deepEqual(parseSelfCommand('Assistant, ertaga osh'), { kind: 'request', text: 'ertaga osh' });
  assert.deepEqual(parseSelfCommand('assistantlar zo\'r'), null);
  assert.deepEqual(parseSelfCommand('Botir, Aliga yoz: ertaga boraman'), { kind: 'write', name: 'Ali', text: 'ertaga boraman' });
  assert.deepEqual(parseSelfCommand('ha'), { kind: 'approve' });
  assert.deepEqual(parseSelfCommand('Ha!'), { kind: 'approve' });
  assert.deepEqual(parseSelfCommand("yo'q"), { kind: 'reject' });
  assert.deepEqual(parseSelfCommand('Botir, yoq'), { kind: 'reject' });
  assert.equal(parseSelfCommand('xarid ro‘yxati: non, sut'), null, 'own note is ignored');
  assert.equal(parseSelfCommand('Botirjonga qo‘ng‘iroq qilish'), null, 'word boundary: not addressed');
  assert.equal(parseSelfCommand('Botir,'), null, 'empty body');
  assert.equal(parseSelfCommand('🤖 Qabul qildim! Botir'), null, 'our own reply is not a command');

  // ---- Permission gate ----
  const store = new MemoryActionStore();
  const sent: string[] = [];
  let failNext = false;
  const send: ActionSend = async (_acc, chatId, text) => {
    if (failNext) return { ok: false, reason: 'peer never wrote to us (no first message to unknown peers)' };
    sent.push(`${chatId}:${text}`);
    return { ok: true, message: { id: 'm', chatId, tgMsgId: 1, direction: 'out', author: 'owner', text, sentAt: new Date().toISOString() } };
  };
  const gate = new ActionGate(store, send);

  const a = await gate.propose({ userId: 'u1', accountId: 'ub:1', chatId: 'ub:1:42', peerTitle: 'Ali', text: ' Salom ' });
  assert.equal(a.status, 'pending');
  assert.equal(sent.length, 0, 'propose never sends');
  assert.equal((await gate.approve('u2', a.id)).ok, false, 'other user cannot approve');
  assert.equal(sent.length, 0);

  const ok = await gate.approve('u1', a.id);
  assert.ok(ok.ok && ok.action.status === 'sent');
  assert.deepEqual(sent, ['ub:1:42:Salom']);
  assert.equal((await gate.approve('u1', a.id)).ok, false, 'no double send');
  assert.equal(sent.length, 1);

  const b = await gate.propose({ userId: 'u1', accountId: 'ub:1', chatId: 'ub:1:43', peerTitle: 'Vali', text: 'x' });
  assert.ok((await gate.reject('u1', b.id)).ok);
  assert.equal((await gate.approve('u1', b.id)).ok, false, 'rejected cannot be approved');
  assert.equal(sent.length, 1, 'rejected is never sent');

  const c = await gate.propose({ userId: 'u1', accountId: 'ub:1', chatId: 'ub:1:44', peerTitle: 'Yangi', text: 'y' });
  failNext = true;
  const blocked = await gate.approve('u1', c.id);
  assert.ok(!blocked.ok && /first message/.test(blocked.reason), 'PolicyGuard still applies after approve');
  assert.equal(store.rows.get(c.id)?.status, 'failed');
  assert.equal((await store.listPending('u1')).length, 0);

  process.stdout.write('user-connect.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`user-connect.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
