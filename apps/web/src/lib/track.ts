/** GA4 hodisasi (gtag yuklanmagan bo'lsa jim o'tadi). Shaxsiy ma'lumot (ism, telefon) YUBORILMAYDI. */
type GtagFn = (cmd: "event", name: string, params?: Record<string, string | number>) => void;

export function track(name: "sign_up" | "generate_lead" | "begin_checkout" | "select_content", params?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
  try {
    gtag?.("event", name, params);
  } catch {}
}
