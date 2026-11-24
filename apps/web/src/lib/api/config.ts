/**
 * API konfiguratsiyasi va "Demo / Jonli" rejim holati.
 *
 * Rejim holati modul darajasida saqlanadi va `useSyncExternalStore` orqali (mode-badge) o'qiladi,
 * shuning uchun sahifada faqat bitta belgi ko'rinadi va u hamma komponentda bir xil.
 */

/** Backend manzili (oxiridagi `/` olib tashlanadi). Build vaqtida `NEXT_PUBLIC_API_URL` dan olinadi. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Majburiy demo: `NEXT_PUBLIC_DEMO=1` yoki API manzili berilmagan. Hech qanday tarmoq so'rovi yuborilmaydi. */
export const FORCE_DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || !API_URL;

/** Oddiy so'rovlar uchun timeout. */
export const TIMEOUT_MS = 4_000;
/** Agent so'rovi / tasdiq: LLM bir necha soniya o'ylaydi. */
export const AGENT_TIMEOUT_MS = 60_000;
/** `/loop/run` ~90s davom etadi. */
export const LOOP_TIMEOUT_MS = 180_000;

let demoActive = FORCE_DEMO;
const listeners = new Set<() => void>();

/** Rejimni o'zgartiradi; qiymat o'zgargandagina obunachilarni xabardor qiladi (keraksiz render yo'q). */
export function setDemo(value: boolean): void {
  if (demoActive === value) return;
  demoActive = value;
  listeners.forEach((l) => l());
}

/** `useSyncExternalStore` uchun kontrakt. Server snapshoti `FORCE_DEMO`: hydration mos keladi. */
export const modeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  getSnapshot: () => demoActive,
  getServerSnapshot: () => FORCE_DEMO,
};
