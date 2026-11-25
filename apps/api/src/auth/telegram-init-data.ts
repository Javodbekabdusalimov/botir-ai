import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** initData eskirgan hisoblanadigan muddat (soniya): o'g'irlangan eski satr bilan kirib bo'lmasin. */
export const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;

/**
 * Telegram Mini App initData tekshiruvi (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * secret = HMAC_SHA256("WebAppData", botToken); hash = HMAC_SHA256(secret, "k=v\n..." saralangan, hash'siz).
 * To'g'ri va yangi bo'lsa foydalanuvchini qaytaradi, aks holda null.
 */
export function verifyInitData(raw: string, botToken: string, nowS = Math.floor(Date.now() / 1000), maxAgeS = INIT_DATA_MAX_AGE_S): TelegramInitUser | null {
  if (!raw || !botToken || raw.length > 4096) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowS - authDate > maxAgeS || authDate - nowS > 60) return null;
  try {
    const user = JSON.parse(params.get('user') ?? '') as Partial<TelegramInitUser>;
    return typeof user.id === 'number' && Number.isSafeInteger(user.id) && user.id > 0 ? (user as TelegramInitUser) : null;
  } catch {
    return null;
  }
}

/** Test va lokal sinov uchun: botToken bilan imzolangan initData yasaydi. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
