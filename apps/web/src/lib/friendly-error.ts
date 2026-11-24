/** Backend/LLM ichki xatosi (masalan "LLM returned no JSON: Not logged in") foydalanuvchiga xom ko'rinmasin. */
const AI_UNAVAILABLE = /not logged in|please run \/login|llm returned no json|llm timeout|internal error|overloaded|rate.?limit/i;

export function isAiUnavailable(msg: string | null | undefined): boolean {
  return !!msg && AI_UNAVAILABLE.test(msg);
}

export function friendlyError(msg: string): string {
  return isAiUnavailable(msg) ? "AI agentlar hozir band, birozdan keyin qayta urinib ko'ring. Hozircha jonli muzokara namunasini ko'rishingiz mumkin." : msg;
}
