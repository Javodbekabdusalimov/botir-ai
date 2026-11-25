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
export const TIMEOUT_MS = 15_000;
/** Agent so'rovi / tasdiq: LLM bir necha soniya o'ylaydi. */
export const AGENT_TIMEOUT_MS = 60_000;
/** `/loop/run` ~90s davom etadi. */
export const LOOP_TIMEOUT_MS = 180_000;

/** "Demo" belgisi faqat majburiy demo rejimda (backend xatosi endi demoga o'tkazmaydi). */
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

/* ---- "Server uyg'onmoqda": so'rov 5 s dan oshsa (Render Free sovuq start ~1 daqiqa) ---- */
export const SLOW_AFTER_MS = 5_000;
let pendingSlow = 0;
const slowListeners = new Set<() => void>();
const emitSlow = () => slowListeners.forEach((l) => l());

/** So'rov boshlanganda chaqiriladi; qaytgan funksiya so'rov tugaganda chaqiriladi. */
export function trackSlow(): () => void {
  let slow = false;
  const t = setTimeout(() => {
    slow = true;
    pendingSlow += 1;
    emitSlow();
  }, SLOW_AFTER_MS);
  return () => {
    clearTimeout(t);
    if (slow) {
      pendingSlow -= 1;
      emitSlow();
    }
  };
}

export const slowStore = {
  subscribe(listener: () => void) {
    slowListeners.add(listener);
    return () => void slowListeners.delete(listener);
  },
  getSnapshot: () => pendingSlow > 0,
  getServerSnapshot: () => false,
};
