import { InlineKeyboard } from 'grammy';

/** Mini App manzili: WEB_URL/tg. Telegram web_app tugmasi faqat https bilan ishlaydi, aks holda null. */
export function miniAppUrl(to?: string): string | null {
  const web = (process.env.WEB_URL ?? '').replace(/\/$/, '');
  if (!web.startsWith('https://')) return null;
  return to ? `${web}/tg?to=${encodeURIComponent(to)}` : `${web}/tg`;
}

/** /start: "Ochish" tugmasi. */
export function openAppKeyboard(): InlineKeyboard | undefined {
  const url = miniAppUrl();
  return url ? new InlineKeyboard().webApp('🚀 Life Assistant ochish', url) : undefined;
}

/**
 * Agent javobidagi .../live/<id> yoki .../pay/<id> havolasi bo'lsa — Mini App ichida ochadigan tugma.
 * Oddiy havola matnda qoladi (tugma ishlamasa ham).
 */
export function linkKeyboard(text: string): InlineKeyboard | undefined {
  const m = /\/(live|pay)\/([A-Za-z0-9-]{1,80})/.exec(text);
  if (!m) return undefined;
  const url = miniAppUrl(`/${m[1]}/${m[2]}`);
  if (!url) return undefined;
  return new InlineKeyboard().webApp(m[1] === 'live' ? '📺 Jonli kuzatish' : "💳 To'lash", url);
}

/** Menyu tugmasi (chat pastidagi): BotFather'da qo'lda sozlamasa ham bot ishga tushganda o'zi qo'yadi. */
export function menuButton(): { type: 'web_app'; text: string; web_app: { url: string } } | null {
  const url = miniAppUrl();
  return url ? { type: 'web_app', text: 'Life Assistant', web_app: { url } } : null;
}
