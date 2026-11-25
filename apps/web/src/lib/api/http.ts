import type { ApiResponse } from "@botir/shared";
import { API_URL, FORCE_DEMO, TIMEOUT_MS, trackSlow } from "./config";

/** Backend xatosi yoki server javob bermadi: foydalanuvchiga ko'rsatiladi (mock'ga o'tilmaydi). */
export class ApiError extends Error {}
/** Resurs topilmadi (faqat `notFoundError: true` so'ralganda tashlanadi). */
export class NotFoundError extends ApiError {}
/** 401: token yaroqsiz (faqat shunda sessiya o'chiriladi). */
export class UnauthorizedError extends ApiError {}

/** Token `localStorage` da shu kalit ostida saqlanadi. */
export const TOKEN_KEY = "botir_token";

/** Saqlangan token; SSR, private rejim yoki bloklangan storage'da `null` (hech qachon tashlamaydi). */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Tokenni saqlaydi; `null` bo'lsa o'chiradi. Storage yo'q bo'lsa jim o'tadi. */
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage mavjud emas: sessiya shu sahifa bilan cheklanadi */
  }
}

function authHeader(): Record<string, string> {
  const token = typeof window === "undefined" ? null : getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Server javob bermadi (tarmoq, timeout, 5xx, buzuq javob): foydalanuvchiga shu matn ko'rsatiladi. */
export const SERVER_DOWN = "Server javob bermadi, qayta urinib ko'ring";

/** Demo rejimda mavjud bo'lmagan amal (to'lov, kirish, Telegram va h.k.). */
export const demoUnavailable = (): never => {
  throw new ApiError("Demo rejimda bu amal ishlamaydi");
};

/**
 * Backend'ga so'rov yuboradi va javobni ochadi (`ApiResponse<T>`).
 *
 * Kontrakt (soxta muvaffaqiyat yo'q):
 * - `fallback` FAQAT `FORCE_DEMO` (`NEXT_PUBLIC_DEMO=1` yoki API manzili yo'q) da ishlaydi;
 * - tarmoq xatosi, timeout, 5xx, buzuq JSON: `ApiError(SERVER_DOWN)`;
 * - 404: `NotFoundError`;
 * - 4xx / `{ ok:false }`: serverning o'z xato matni bilan `ApiError`;
 * - so'rov 5 s dan oshsa `slowStore` "Server uyg'onmoqda" yozuvini yoqadi.
 */
export async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallback: () => T | Promise<T>,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T> {
  if (FORCE_DEMO) return fallback();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const endSlow = trackSlow();
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        // FormData uchun brauzer o'zi boundary bilan Content-Type qo'yadi
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...authHeader(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(SERVER_DOWN);
  } finally {
    clearTimeout(timer);
    endSlow();
  }
  if (res.status === 404) throw new NotFoundError("Topilmadi");
  if (res.status >= 500) {
    // 503 da server o'z matnini beradi (masalan "AI hozir javob bermadi"): bo'lsa shuni ko'rsatamiz
    const msg = await res
      .json()
      .then((b: Partial<ApiResponse<T>> & { message?: string }) => (b && "error" in b && b.error) || b?.message)
      .catch(() => null);
    throw new ApiError(typeof msg === "string" && msg && res.status === 503 ? msg : SERVER_DOWN);
  }
  let body: ApiResponse<T> & { message?: string | string[] };
  try {
    body = (await res.json()) as ApiResponse<T> & { message?: string | string[] };
  } catch {
    throw new ApiError(SERVER_DOWN);
  }
  if (res.status === 401) throw new UnauthorizedError(textOf(body) || "Sessiya tugagan, qayta kiring");
  if (!res.ok || !body.ok) throw new ApiError(textOf(body) || "Xatolik yuz berdi");
  return body.data;
}

/** Nest xatosi (`message`) yoki `{ ok:false, error }` dan matn. */
function textOf(b: { ok?: boolean; error?: string; message?: string | string[] }): string {
  if (b.ok === false && b.error) return b.error;
  if (Array.isArray(b.message)) return b.message.join(", ");
  return b.message ?? "";
}

/** JSON `RequestInit` yasaydi (`body` bo'lmasa bo'sh). */
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Demo rejimda tarmoq kechikishini taqlid qiladi. */
export const delay = <T>(ms: number, value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));
