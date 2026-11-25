// Run: pnpm exec tsx apps/api/src/outreach/outreach.test.ts  (no network, no DB)
import { strict as assert } from 'node:assert';
import { normalizeContacts, pickChannel, tgHandle, withDisclosure } from './contacts';
import { importDirectory, parseDirectoryEntry, type DirectoryRow, type DirectoryStore } from './directory';
import { canonicalDistrict, districtsIn } from './districts';

const SRC = ['https://example.uz/contacts'];

async function main(): Promise<void> {
  // Channel if/else: first match wins, phone sits below telegram/instagram.
  const all = { telegramUser: 'ali_shop', telegramBot: 'ali_bot', telegramChannel: 'ali_news', instagram: 'ali', phone: '+998901112233', website: 'https://ali.uz/' };
  assert.deepEqual(pickChannel(all), { channel: 'telegram_user', link: 'https://t.me/ali_shop' });
  const { telegramUser: _u, ...noUser } = all;
  assert.equal(pickChannel(noUser).channel, 'telegram_bot');
  assert.match(pickChannel(noUser).link ?? '', /^https:\/\/t\.me\/ali_bot\?start=/);
  const { telegramBot: _b, ...noBot } = noUser;
  assert.deepEqual(pickChannel(noBot), { channel: 'handoff', handoffKind: 'telegram_channel', link: 'https://t.me/ali_news' });
  const { telegramChannel: _c, ...noChannel } = noBot;
  assert.deepEqual(pickChannel(noChannel), { channel: 'handoff', handoffKind: 'instagram', link: 'https://ig.me/m/ali' });
  assert.deepEqual(pickChannel({ phone: '+998901112233', website: 'https://ali.uz/' }), { channel: 'handoff', handoffKind: 'phone', link: 'tel:+998901112233' });
  assert.deepEqual(pickChannel({ website: 'https://ali.uz/' }), { channel: 'handoff', handoffKind: 'website', link: 'https://ali.uz/' });
  assert.deepEqual(pickChannel({}), { channel: 'none' });

  // Normalization: bad values dropped, nothing guessed.
  assert.equal(tgHandle('https://t.me/Foo_Bar?start=1'), 'Foo_Bar');
  assert.equal(tgHandle('@x'), undefined);
  assert.deepEqual(normalizeContacts({ telegramBot: '@BeshqozonBot', phone: '12', website: 'not a url', instagram: null }), { telegramBot: 'BeshqozonBot' });
  assert.deepEqual(normalizeContacts({ phone: '+998983079404' }), { phone: '+998983079404' });
  assert.equal(normalizeContacts({ phone: '901234567' }).phone, '+998901234567');

  // Disclosure is guaranteed.
  assert.match(withDisclosure('Salom, osh bormi?'), /Life Assistant yordamchisi orqali yozilmoqda/);
  assert.equal(withDisclosure('Salom. Life Assistant yordamchisi orqali yozilmoqda.'), 'Salom. Life Assistant yordamchisi orqali yozilmoqda.');

  // Districts.
  assert.equal(canonicalDistrict('Chilonzorda moy almashtirish'), 'Chilonzor');
  assert.equal(canonicalDistrict("Mirzo Ulug'bekka borish"), "Mirzo Ulug'bek");
  assert.equal(canonicalDistrict('Yunusobodga'), 'Yunusobod');
  assert.equal(canonicalDistrict('uyda'), undefined);
  assert.deepEqual(districtsIn('Chilonzorda osh, Yunusobodda moy'), ['Chilonzor', 'Yunusobod']);

  // Importer validation: no sources → rejected; nulls stay null.
  assert.equal(parseDirectoryEntry({ name: 'A', category: 'shop', sources: [] }).ok, false);
  assert.equal(parseDirectoryEntry({ name: 'A', category: 'shop' }).ok, false);
  assert.equal(parseDirectoryEntry({ name: 'A', category: 'shop', sources: ['ftp://x'] }).ok, false, 'sources must be http(s)');
  assert.equal(parseDirectoryEntry({ name: 'A', category: 'nope', sources: SRC }).ok, false);
  assert.equal(parseDirectoryEntry({ category: 'shop', sources: SRC }).ok, false);
  const minimal = parseDirectoryEntry({ name: 'A', category: 'shop', district: null, address: null, lat: 41.3, lng: null, sources: SRC, contacts: {} });
  assert.ok(minimal.ok);
  if (minimal.ok) {
    assert.deepEqual([minimal.row.district, minimal.row.address, minimal.row.lat, minimal.row.lng, minimal.row.workHours], [null, null, null, null, null]);
  }

  // Idempotent on name+address (case-insensitive), create-only.
  const rows = new Map<string, DirectoryRow>();
  const store: DirectoryStore = { has: async (k) => rows.has(k), create: async (r) => void rows.set(r.dedupeKey, r) };
  const entries = [
    { name: 'Besh Qozon', category: 'restaurant', address: "Iftixor ko'chasi, 1", sources: SRC },
    { name: 'BESH QOZON', category: 'restaurant', address: "iftixor koʻchasi, 1", sources: SRC },
    { name: 'Besh Qozon', category: 'restaurant', address: 'Boshqa manzil', sources: SRC },
    { name: 'No source', category: 'shop', address: 'x', sources: [] },
  ];
  const first = await importDirectory(store, entries);
  assert.deepEqual([first.created, first.skipped, first.rejected.length], [2, 1, 1]);
  const second = await importDirectory(store, entries);
  assert.deepEqual([second.created, second.skipped, second.rejected.length], [0, 3, 1]);
  await assert.rejects(importDirectory(store, { not: 'an array' }));

  process.stdout.write('outreach.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`outreach.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
