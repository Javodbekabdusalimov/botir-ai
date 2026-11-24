// Pure auth helpers on node:crypto only (no native deps): phone normalize, scrypt passwords, HS256 JWT.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { parseJson } from '../common/http';

/** "90 000 00 01" | "998900000001" | "+998 90 000-00-01" → "+998900000001"; otherwise null. */
export const normalizePhone = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  const full = digits.length === 9 ? `998${digits}` : digits;
  return /^998\d{9}$/.test(full) ? `+${full}` : null;
};

/** Stored as "salt:hash" (hex). */
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), expected.length), expected);
};

export interface TokenPayload {
  sub: string; // user id
  role: string;
  iat: number;
  exp: number;
}

const TOKEN_TTL_SEC = 7 * 24 * 3600;
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const hmac = (data: string, secret: string): Buffer => createHmac('sha256', secret).update(data).digest();

export const signJwt = (payload: Pick<TokenPayload, 'sub' | 'role'>, secret: string): string => {
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat, exp: iat + TOKEN_TTL_SEC })).toString('base64url');
  return `${HEADER}.${body}.${hmac(`${HEADER}.${body}`, secret).toString('base64url')}`;
};

/** Signature + expiry check. Algorithm is fixed to HS256 (header is not trusted). */
export const verifyJwt = (token: string, secret: string): TokenPayload | null => {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = hmac(`${head}.${body}`, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const p = parseJson<Partial<TokenPayload>>(Buffer.from(body, 'base64url').toString('utf8'), {});
  if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
  return p as TokenPayload;
};
