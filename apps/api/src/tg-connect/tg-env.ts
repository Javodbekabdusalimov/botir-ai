// Reads Telegram API credentials from env. Values are never logged.
export interface TgApiCreds {
  apiId: number;
  apiHash: string;
}

export function loadTgApiCreds(env: NodeJS.ProcessEnv = process.env): TgApiCreds {
  const apiId = Number(env.TG_API_ID);
  const apiHash = env.TG_API_HASH ?? '';
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error('TG_API_ID / TG_API_HASH are not set (get them at my.telegram.org)');
  }
  return { apiId, apiHash };
}
