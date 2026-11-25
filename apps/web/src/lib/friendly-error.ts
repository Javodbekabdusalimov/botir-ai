/** Backend/LLM ichki xatosi (masalan "LLM returned no JSON: Not logged in") foydalanuvchiga xom ko'rinmasin. */
const AI_UNAVAILABLE = /not logged in|please run \/login|llm returned no json|llm timeout|internal error|overloaded|rate.?limit|claude -p exit|invalid api key/i;
/** Texnik ichki tafsilot (yo'l, jarayon, ORM): umumiy matn bilan almashtiriladi. */
const TECHNICAL = /ENOENT|spawn|prisma|\/Users\/|\/home\/|\bat [\w.<>]+ \(|stack|TypeError|ReferenceError|ECONN|ETIMEDOUT/i;
/** Asosan lotin harfli inglizcha xabar (o'zbekcha belgilarsiz): xom backend matni deb hisoblanadi. */
const ENGLISH_ONLY = /^[\x20-\x7E]+$/;
const UZ_HINT = /[og]'|\b(va|yo'q|bor|qayta|xato|topilmadi|so'm|kerak|emas|uchun|uzildi|ulanish)\b/i;

export const AI_DOWN_TEXT = "AI agentlar hozir band, birozdan keyin qayta urinib ko'ring.";
export const TECH_ERROR_TEXT = "Texnik xato, qayta urinib ko'ring.";

export function isAiUnavailable(msg: string | null | undefined): boolean {
  return !!msg && AI_UNAVAILABLE.test(msg);
}

/** Har qanday xato matnini foydalanuvchiga ko'rsatiladigan o'zbekcha matnga aylantiradi. */
export function friendlyError(msg: string | null | undefined): string {
  if (!msg) return TECH_ERROR_TEXT;
  if (isAiUnavailable(msg)) return AI_DOWN_TEXT;
  if (TECHNICAL.test(msg)) return TECH_ERROR_TEXT;
  if (/not found/i.test(msg)) return "Topilmadi";
  if (ENGLISH_ONLY.test(msg) && !UZ_HINT.test(msg)) return TECH_ERROR_TEXT;
  return msg;
}
