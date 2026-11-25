import * as mock from "../mock";
import type { NegotiationEvent } from "../types";
import { API_URL, FORCE_DEMO } from "./config";
import { recallNeeds } from "./negotiation-memory";

/** Qayta ulanish oralig'i: 1s, 2s, 4s, 4s, 4s (eksponensial, yuqori chegara bilan). */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 4_000;
const MAX_RECONNECTS = 5;
/** UI shu matnni ko'rsa "Yangi so'rov" tugmasini chiqaradi. */
export const NEGOTIATION_NOT_FOUND = "Muzokara topilmadi";
/** Backend yuboradigan SSE hodisa nomlari. */
const SSE_EVENTS = ["message", "best_offer", "status", "error"] as const;

/**
 * Muzokara oqimi: `GET /negotiations/:id/stream` (SSE). Qaytargani: yopish funksiyasi.
 *
 * Kontrakt va chekka holatlar:
 * - `demo*` id yoki FORCE_DEMO: skriptli mock oqim;
 * - har SSE `data` = `JSON.stringify(NegotiationEvent)`; `onmessage` ulanmaydi (aks holda xabar 2 marta chiqadi);
 * - server qayta ulanishda eski hodisalarni replay qiladi: bir xil `data` takrorlari tashlanadi;
 * - server oqimni tugatganda (yakuniy status) paydo bo'ladigan `onerror` xato emas;
 * - server `error` "not found" yuborsa: oqim yopiladi, `onFail(NOT_FOUND)`;
 * - uzilishda ko'pi bilan 5 qayta ulanish (hisoblagich faqat message/best_offer da nolga tushadi), keyin `onFail`.
 */
export function streamNegotiation(
  id: string,
  onEvent: (e: NegotiationEvent) => void,
  onFail?: (msg: string) => void,
): () => void {
  if (FORCE_DEMO || id.startsWith("demo")) return mock.runMockStream(id, recallNeeds(id), onEvent);

  let es: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let received = false;
  let finished = false;
  let stopped = false;
  let attempts = 0;
  const seen = new Set<string>();

  const handle = (ev: MessageEvent<string>) => {
    if (typeof ev.data !== "string") return; // ma'lumotsiz ulanish xatosi: onerror hal qiladi
    received = true;
    if (seen.has(ev.data)) return;
    seen.add(ev.data);
    try {
      const parsed = JSON.parse(ev.data) as NegotiationEvent;
      if (parsed.type === "message" || parsed.type === "best_offer") attempts = 0;
      if (parsed.type === "error" && /not found/i.test(parsed.error)) {
        finished = true;
        es?.close();
        es = null;
        onFail?.(NEGOTIATION_NOT_FOUND);
        return;
      }
      if (parsed.type === "status" && parsed.status !== "running") finished = true;
      onEvent(parsed);
    } catch {
      onFail?.("Oqimdan noto'g'ri ma'lumot keldi");
    }
  };

  const connect = () => {
    if (stopped) return;
    const source = new EventSource(`${API_URL}/negotiations/${encodeURIComponent(id)}/stream`);
    es = source;
    SSE_EVENTS.forEach((t) => source.addEventListener(t, handle as EventListener));
    source.onerror = () => {
      source.close();
      es = null;
      if (finished || stopped) return;
      if (attempts < MAX_RECONNECTS) {
        const wait = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
        attempts += 1;
        retryTimer = setTimeout(connect, wait);
        return;
      }
      finished = true;
      onFail?.(received ? "Aloqa uzildi. Qayta ulanish tugmasini bosing." : NEGOTIATION_NOT_FOUND);
    };
  };
  connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}
