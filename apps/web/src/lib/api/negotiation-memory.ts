import type { AgentRequestResult } from "../types";

/** `sessionStorage` kaliti prefiksi: `botir.neg.<negotiationId>`. */
const NEG_KEY = "botir.neg.";

/** Mock skripti qaysi kategoriya uchun qaysi "needs" matnini ishlatishini aniqlaydi. */
const CATEGORY_TO_MOCK_BIZ: Record<string, string> = { autoservice: "chilonzor", shop: "malika" };
const DEFAULT_MOCK_BIZ = "chorsu";

interface Remembered {
  needs: Record<string, string>;
  text: string;
}

function read(id: string): Remembered | null {
  try {
    const raw = sessionStorage.getItem(NEG_KEY + id);
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

/** /live ekrani uchun so'rov matni va ehtiyojlarni eslab qoladi (storage yo'q bo'lsa jim o'tadi). */
export function rememberRequest(result: AgentRequestResult, text: string): void {
  try {
    const needs: Record<string, string> = {};
    result.tasks.forEach((t) => {
      needs[CATEGORY_TO_MOCK_BIZ[t.category] ?? DEFAULT_MOCK_BIZ] = t.need;
    });
    sessionStorage.setItem(NEG_KEY + result.negotiationId, JSON.stringify({ needs, text } satisfies Remembered));
  } catch {
    /* sessionStorage yo'q: /live "Qayta urinish" /assistant ga yo'naltiradi */
  }
}

/** /live "Qayta urinish" uchun asl so'rov matni. */
export function recallRequestText(id: string): string | undefined {
  return read(id)?.text;
}

/** Mock oqim uchun ehtiyojlar. */
export function recallNeeds(id: string): Record<string, string> | undefined {
  return read(id)?.needs;
}
