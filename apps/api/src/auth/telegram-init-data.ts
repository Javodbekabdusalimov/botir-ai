// Telegram Mini App initData check (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// Pure node:crypto, no Nest: secret = HMAC_SHA256(key="WebAppData", msg=botToken);
// hash must equal hex(HMAC_SHA256(key=secret, msg=data_check_string)), where data_check_string is every field except
// `hash`, sorted by key, joined as "key=value" with "\n".
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramWebAppUser; authDate: number; startParam?: string }
  | { ok: false; reason: 'malformed' | 'bad_hash' | 'expired' | 'no_user' };

export const INIT_DATA_MAX_AGE_SEC = 24 * 3600;
const MAX_INIT_DATA_LENGTH = 4096;

const hmac = (key: string | Buffer, msg: string): Buffer => createHmac('sha256', key).update(msg).digest();

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const secret = hmac('WebAppData', botToken);
  return hmac(secret, dataCheckString(new URLSearchParams(fields))).toString('hex');
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function parseUser(raw: string | null): TelegramWebAppUser | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Partial<TelegramWebAppUser>;
    if (typeof u.id !== 'number' || !Number.isSafeInteger(u.id) || u.id <= 0) return null;
    return {
      id: u.id,
      first_name: typeof u.first_name === 'string' ? u.first_name : '',
      ...(typeof u.last_name === 'string' ? { last_name: u.last_name } : {}),
      ...(typeof u.username === 'string' ? { username: u.username } : {}),
    };
  } catch {
    return null;
  }
}

/** Never trusts a field before the signature matches. `now` is unix seconds (injectable for tests). */
export function verifyInitData(initData: unknown, botToken: string, now = Math.floor(Date.now() / 1000)): InitDataResult {
  if (typeof initData !== 'string' || !initData || initData.length > MAX_INIT_DATA_LENGTH || !botToken) return { ok: false, reason: 'malformed' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'malformed' };

  const expected = hmac(hmac('WebAppData', botToken), dataCheckString(params));
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (now - authDate > INIT_DATA_MAX_AGE_SEC || authDate - now > 60) return { ok: false, reason: 'expired' };

  const user = parseUser(params.get('user'));
  if (!user) return { ok: false, reason: 'no_user' };
  const startParam = params.get('start_param') ?? undefined;
  return { ok: true, user, authDate, ...(startParam ? { startParam } : {}) };
}
