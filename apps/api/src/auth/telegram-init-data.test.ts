// Run: pnpm exec tsx src/auth/telegram-init-data.test.ts
import { strict as assert } from 'node:assert';
import { signInitData, verifyInitData } from './telegram-init-data';

const TOKEN = '123456:TEST-token-not-real';
const now = 1_764_000_000;
const user = JSON.stringify({ id: 777, first_name: 'Ali', username: 'ali' });
const good = signInitData({ auth_date: String(now - 60), query_id: 'AAE', user }, TOKEN);

assert.deepEqual(verifyInitData(good, TOKEN, now), { id: 777, first_name: 'Ali', username: 'ali' });
// boshqa bot tokeni bilan imzolangan
assert.equal(verifyInitData(good, '999:other', now), null);
// o'zgartirilgan user (id almashtirilgan)
assert.equal(verifyInitData(good.replace('777', '778'), TOKEN, now), null);
// eskirgan (2 kun)
assert.equal(verifyInitData(signInitData({ auth_date: String(now - 172_800), user }, TOKEN), TOKEN, now), null);
// hash yo'q / buzuq
assert.equal(verifyInitData(`auth_date=${now}&user=${encodeURIComponent(user)}`, TOKEN, now), null);
assert.equal(verifyInitData('hash=zz', TOKEN, now), null);
// user yo'q
assert.equal(verifyInitData(signInitData({ auth_date: String(now) }, TOKEN), TOKEN, now), null);
// bo'sh token
assert.equal(verifyInitData(good, '', now), null);
console.info('telegram-init-data: OK');
