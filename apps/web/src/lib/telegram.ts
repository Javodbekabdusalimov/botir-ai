/**
 * Telegram Mini App yordamchilari. `telegram-web-app.js` faqat Telegram ichida yuklanadi (TelegramShell).
 * initDataUnsafe dagi ism/id ga ishonilmaydi: kirish faqat serverda tekshirilgan initData orqali (POST /auth/telegram).
 */

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { first_name?: string } };
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  BackButton: TgButton;
  onEvent?(event: "themeChanged", cb: () => void): void;
  offEvent?(event: "themeChanged", cb: () => void): void;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const TG_SCRIPT = "https://telegram.org/js/telegram-web-app.js";
/** Shu tab Telegram ichida ochilganini eslab qolamiz: sahifa yangilansa ham skript qayta yuklanadi. */
const FLAG = "botir.tg";

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : null;
}

/** URL hash'da tgWebAppData bo'lsa yoki oldin /tg orqali kirilgan bo'lsa — Telegram ichidamiz. */
export function inTelegramHint(): boolean {
  try {
    if (window.location.hash.includes("tgWebAppData")) return true;
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function markTelegram(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {}
}

/** Tashqi havola (TezCheck): Telegram ichida openLink, oddiy brauzerda shu tabda. */
export function openExternal(url: string): void {
  const w = tg();
  if (w && /^https?:\/\//.test(url)) w.openLink(url);
  else window.location.href = url;
}

export function haptic(type: "success" | "error" | "warning"): void {
  try {
    tg()?.HapticFeedback?.notificationOccurred(type);
  } catch {}
}

/** Faqat ichki yo'l: "/" bilan boshlanadi, "//" yoki "/\" (tashqi saytga o'tish) emas. */
export function safeInternalPath(to: string | null | undefined): string | null {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return null;
  return to;
}

/** KONTRAKT start_param: live_<id> → /live/<id>, pay_<id> → /pay/<id>, plan → /narxlar. */
export function startParamPath(sp: string | null | undefined): string | null {
  if (!sp) return null;
  if (sp === "plan") return "/narxlar";
  const m = /^(live|pay)_([A-Za-z0-9-]{1,80})$/.exec(sp);
  return m ? `/${m[1]}/${encodeURIComponent(m[2])}` : null;
}
