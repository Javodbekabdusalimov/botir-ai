// Run: pnpm exec tsx apps/api/src/telegram-bot/bot.test.ts  (no network: a local fake Telegram Bot API)
// A bot failure (bad token 401, second instance 409) must never crash the API process.
import { strict as assert } from 'node:assert';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Bot } from 'grammy';
import { startBot } from './bot';

type Reply = { ok: boolean; result?: unknown; error_code?: number; description?: string };

async function fakeApi(handler: (method: string) => Reply): Promise<{ server: Server; root: string; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    const method = (req.url ?? '').split('/').pop() ?? '';
    calls.push(method);
    req.resume();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(handler(method)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, root: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls };
}

const ME = { id: 1, is_bot: true, first_name: 'Botir', username: 'botir_test_bot' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  let crashed = false;
  process.on('unhandledRejection', () => { crashed = true; });

  // 401: the bot switches itself off, no retry, process alive.
  const bad = await fakeApi(() => ({ ok: false, error_code: 401, description: 'Unauthorized' }));
  startBot(new Bot('1:bad', { client: { apiRoot: bad.root } }), 50);
  await wait(300);
  assert.equal(crashed, false, '401 must not crash the process');
  assert.equal(bad.calls.filter((c) => c === 'getMe').length, 1, '401 → no retry');
  bad.server.close();

  // 409 (another instance polls the same token): retried later, process alive.
  const conflict = await fakeApi((m) =>
    m === 'getMe' ? { ok: true, result: ME } : m === 'deleteWebhook' ? { ok: true, result: true } : { ok: false, error_code: 409, description: 'Conflict' },
  );
  const bot = new Bot('1:ok', { client: { apiRoot: conflict.root } });
  startBot(bot, 50);
  await wait(500);
  assert.equal(crashed, false, '409 must not crash the process');
  assert.ok(conflict.calls.filter((c) => c === 'getUpdates').length >= 2, `409 → retried: ${conflict.calls.join(',')}`);
  await bot.stop().catch(() => undefined);
  conflict.server.close();

  process.stdout.write('bot.test: OK\n');
  process.exit(0); // retry timers are unref'd; exit explicitly in case a fetch keeps the loop alive
}

main().catch((e: unknown) => {
  process.stderr.write(`bot.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
