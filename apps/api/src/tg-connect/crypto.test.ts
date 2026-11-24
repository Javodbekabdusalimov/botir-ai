// Run: pnpm exec tsx apps/api/src/tg-connect/crypto.test.ts
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { decryptSession, encryptSession, loadSessionKey } from './crypto';

const key = randomBytes(32);
const plain = '1BAAOMTQ5LjE1NC4xNjcuNTEAUFAKE-session-' + 'x'.repeat(300);

const enc = encryptSession(plain, key);
assert.notEqual(enc, plain);
assert.ok(!enc.includes('FAKE-session'));
assert.equal(decryptSession(enc, key), plain);
assert.notEqual(encryptSession(plain, key), enc, 'random IV → different ciphertext');

// Wrong key and tampering must fail (GCM auth tag).
assert.throws(() => decryptSession(enc, randomBytes(32)));
const raw = Buffer.from(enc, 'base64');
raw[raw.length - 1] ^= 1;
assert.throws(() => decryptSession(raw.toString('base64'), key));
assert.throws(() => decryptSession('short', key));

// Key loading from env-like hex.
assert.equal(loadSessionKey(key.toString('hex')).length, 32);
assert.throws(() => loadSessionKey(undefined));
assert.throws(() => loadSessionKey('abc'));

process.stdout.write('crypto.test: OK (7 checks)\n');
