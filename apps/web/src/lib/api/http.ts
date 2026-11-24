import type { ApiResponse } from "@botir/shared";
import { API_URL, FORCE_DEMO, TIMEOUT_MS, setDemo } from "./config";

/** Haqiqiy (4xx yoki `{ ok:false }`) backend xatosi. Mock'ga o'tkazilmaydi, foydalanuvchiga ko'rsatiladi. */
export class ApiError extends Error {}
/** Resurs topilmadi (faqat `notFoundError: true` so'ralganda tashlanadi). */
export class NotFoundError extends ApiError {}

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

/** `request` qo'shimcha sozlamalari. */
export interface RequestOptions {
  /** 404 ni `NotFoundError` sifatida tashlaydi (aks holda mock fallback). */
  notFoundError?: boolean;
}

/**
 * Backend'ga so'rov yuboradi va javobni ochadi (`ApiResponse<T>`).
 *
 * Kontrakt:
 * - tarmoq xatosi, timeout, 5xx, buzuq JSON: "Demo" rejimga o'tadi va `fallback()` natijasini qaytaradi;
 * - 404: backend tirik (rejim "Jonli" qoladi), `fallback()` yoki `notFoundError` bo'lsa `NotFoundError`;
 * - 4xx / `{ ok:false }`: `ApiError` (haqiqiy xato, mock'ga o'tilmaydi);
 * - `FORCE_DEMO` da tarmoqqa umuman chiqmaydi.
 */
export async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallback: () => T | Promise<T>,
  timeoutMs: number = TIMEOUT_MS,
  opts: RequestOptions = {},
): Promise<T> {
  if (FORCE_DEMO) return fallback();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    setDemo(true);
    return fallback();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    // Server javob berdi = backend tirik. "Demo"ga o'tmaymiz (aks holda belgi Jonli/Demo o'rtasida sakraydi).
    setDemo(false);
    if (opts.notFoundError) throw new NotFoundError("Topilmadi");
    return fallback();
  }
  if (res.status >= 500) {
    setDemo(true);
    return fallback();
  }
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    setDemo(true);
    return fallback();
  }
  setDemo(false);
  if (!body.ok) throw new ApiError(body.error || "Xatolik yuz berdi");
  return body.data;
}

/** JSON `RequestInit` yasaydi (`body` bo'lmasa bo'sh). */
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Demo rejimda tarmoq kechikishini taqlid qiladi. */
export const delay = <T>(ms: number, value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));
