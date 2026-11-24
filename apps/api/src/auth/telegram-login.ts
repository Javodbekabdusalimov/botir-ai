import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramLoginPayload {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

const MAX_AUTH_AGE_SEC = 86_400;

/**
 * Verifies a Telegram Login Widget payload per Telegram's documented algorithm:
 * secret = SHA256(bot_token), expected = HMAC_SHA256(sorted data_check_string, secret).
 */
export function verifyTelegramLogin(payload: TelegramLoginPayload, botToken: string): boolean {
  const { hash, ...fields } = payload;
  if (!hash) return false;

  const dataCheckString = Object.keys(fields)
    .filter((key) => fields[key as keyof typeof fields] !== undefined)
    .sort()
    .map((key) => `${key}=${String(fields[key as keyof typeof fields])}`)
    .join('\n');

  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const given = Buffer.from(hash, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) return false;
  return Date.now() / 1000 - authDate < MAX_AUTH_AGE_SEC;
}
