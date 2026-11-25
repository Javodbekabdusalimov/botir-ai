// Run: pnpm exec tsx apps/api/src/outreach/outreach-llm.test.ts  (stub LLM, fake DB: no network)
import { strict as assert } from 'node:assert';
import { OutreachService } from './outreach.service';

const ext = {
  id: 'e1', name: 'Besh Qozon', district: 'Yunusobod', deletedAt: null,
  contacts: JSON.stringify({ telegramBot: 'BeshqozonBot' }),
};

function service(llm: () => Promise<{ data: { text?: string } }>): OutreachService {
  const db = { externalBusiness: { findFirst: async () => ext } };
  const agents = { llm: { completeJson: llm } };
  return new (OutreachService as unknown as new (...a: unknown[]) => OutreachService)(db, agents, {}, {}, {});
}

async function main(): Promise<void> {
  // LLM text without the disclosure → added in code.
  const a = await service(async () => ({ data: { text: 'Assalomu alaykum! Ertaga osh bormi?' } })).draft('e1', { text: 'osh, 6 kishi' });
  assert.match(a.text, /Life Assistant yordamchisi orqali yozilmoqda/);
  assert.equal(a.channel, 'telegram_bot');
  assert.equal(a.startFirst, true);
  // LLM down → deterministic template, still with the disclosure.
  const b = await service(async () => { throw new Error('limit'); }).draft('e1', { text: 'osh, 6 kishi' });
  assert.match(b.text, /osh, 6 kishi/);
  assert.match(b.text, /Life Assistant yordamchisi orqali yozilmoqda/);
  await assert.rejects(service(async () => ({ data: {} })).draft('e1', { text: '  ' }));
  process.stdout.write('outreach-llm.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`outreach-llm.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
