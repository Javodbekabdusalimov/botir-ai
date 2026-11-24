import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for Telegram session strings. Format: base64(iv[12] | tag[16] | ciphertext).
const IV_LEN = 12;
const TAG_LEN = 16;

export function loadSessionKey(hex = process.env.TG_SESSION_KEY): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('TG_SESSION_KEY must be 32-byte hex (64 chars)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSession(plain: string, key: Buffer = loadSessionKey()): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptSession(payload: string, key: Buffer = loadSessionKey()): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('Encrypted session is malformed');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
}
