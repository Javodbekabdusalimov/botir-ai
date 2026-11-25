// Run: pnpm exec tsx apps/api/src/auth/telegram-init-data.test.ts
import { strict as assert } from 'node:assert';
import { INIT_DATA_MAX_AGE_SEC, signInitData, verifyInitData } from './telegram-init-data';

const TOKEN = '123456:TEST-bot-token';
const NOW = 1_800_000_000;
const USER = JSON.stringify({ id: 42, first_name: 'Ali', username: 'ali' });

function build(fields: Record<string, string>, token = TOKEN): string {
  return new URLSearchParams({ ...fields, hash: signInitData(fields, token) }).toString();
}
const base = { auth_date: String(NOW - 10), query_id: 'AAH', user: USER, start_param: 'live_abc' };

// 1. Valid signature → ok, user + start_param parsed.
{
  const r = verifyInitData(build(base), TOKEN, NOW);
  assert.ok(r.ok, 'valid initData must pass');
  if (r.ok) {
    assert.equal(r.user.id, 42);
    assert.equal(r.user.first_name, 'Ali');
    assert.equal(r.startParam, 'live_abc');
  }
}

// 2. One changed character in a signed field → bad_hash.
{
  const tampered = build(base).replace('Ali', 'Alo');
  assert.deepEqual(verifyInitData(tampered, TOKEN, NOW), { ok: false, reason: 'bad_hash' });
}

// 3. Signed with another bot token → bad_hash.
assert.deepEqual(verifyInitData(build(base, '999:other'), TOKEN, NOW), { ok: false, reason: 'bad_hash' });

// 4. auth_date older than 24h → expired; far future → expired.
assert.deepEqual(
  verifyInitData(build({ ...base, auth_date: String(NOW - INIT_DATA_MAX_AGE_SEC - 1) }), TOKEN, NOW),
  { ok: false, reason: 'expired' },
);
assert.deepEqual(verifyInitData(build({ ...base, auth_date: String(NOW + 3600) }), TOKEN, NOW), { ok: false, reason: 'expired' });

// 5. No bot token configured → never lets anyone in.
assert.deepEqual(verifyInitData(build(base), '', NOW), { ok: false, reason: 'malformed' });

// 6. Garbage / missing hash / non-string → malformed.
for (const bad of ['buzuq', '', 'user=%7B%7D', 42, null, undefined, 'a'.repeat(5000)]) {
  const r = verifyInitData(bad, TOKEN, NOW);
  assert.equal(r.ok, false, `must reject ${String(bad).slice(0, 20)}`);
}

// 7. Signed but without a usable user → no_user.
assert.deepEqual(verifyInitData(build({ auth_date: String(NOW) }), TOKEN, NOW), { ok: false, reason: 'no_user' });
assert.deepEqual(verifyInitData(build({ auth_date: String(NOW), user: '{"id":-1}' }), TOKEN, NOW), { ok: false, reason: 'no_user' });

// 8. Field order in the query string does not matter (data_check_string is sorted).
{
  const hash = signInitData(base, TOKEN);
  const reordered = `user=${encodeURIComponent(USER)}&hash=${hash}&start_param=live_abc&auth_date=${NOW - 10}&query_id=AAH`;
  assert.ok(verifyInitData(reordered, TOKEN, NOW).ok);
}

console.log('telegram-init-data: OK');
