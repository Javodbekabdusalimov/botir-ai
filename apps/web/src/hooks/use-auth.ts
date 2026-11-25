"use client";

import { useEffect, useSyncExternalStore } from "react";
import { UnauthorizedError, getMe, getToken, login as apiLogin, register as apiRegister, setToken, telegramAuth } from "@/lib/api";
import { clearBusinessId, setBusinessId } from "@/hooks/use-business";
import type { AuthResult, AuthUser, MeResponse, RegisterDto } from "@/lib/types";

export interface AuthState {
  /** loading: token tekshirilmoqda (SSR va birinchi render ham shu) */
  status: "loading" | "out" | "in";
  user: AuthUser | null;
  /** Biznes egasining obuna holati (GET /auth/me) */
  business?: MeResponse["business"];
  /** Token bor, lekin server javob bermayapti: sessiya saqlanadi, fonda qayta urinamiz. */
  offline?: boolean;
}

const SERVER: AuthState = { status: "loading", user: null };
let state: AuthState = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function rememberUser(id: string) {
  try {
    localStorage.setItem("botir.userId", id);
  } catch {}
}

function applyMe(me: MeResponse) {
  const u = { ...me.user, businessId: me.user.businessId ?? me.businessId };
  if (u.businessId) setBusinessId(u.businessId);
  rememberUser(u.id);
  set({ status: "in", user: u, business: me.business });
}

async function applySession(r: AuthResult) {
  setToken(r.token);
  rememberUser(r.user.id);
  if (r.user.businessId) setBusinessId(r.user.businessId);
  set({ status: "in", user: r.user });
  try {
    applyMe(await getMe(r.token)); // obuna holatini ham olamiz
  } catch {}
}

/** Obuna holatini qayta o'qish (Pro faollashgandan keyin) */
export async function refreshMe() {
  const token = getToken();
  if (!token) return;
  try {
    applyMe(await getMe(token));
  } catch {}
}

async function init() {
  if (started) return;
  started = true;
  const token = getToken();
  if (!token) return set({ status: "out", user: null });
  // Token faqat 401 da o'chadi. Server uxlayotgan/xato bo'lsa token saqlanadi va server javob berguncha qayta urinamiz.
  for (let i = 0; ; i++) {
    try {
      return applyMe(await getMe(token));
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setToken(null);
        return set({ status: "out", user: null });
      }
      if (i >= 1 && !state.offline) set({ status: "loading", user: null, offline: true });
      if (!getToken()) return; // kutish paytida chiqib ketgan
      await new Promise((r) => setTimeout(r, INIT_RETRY_MS));
    }
  }
}
const INIT_RETRY_MS = 4_000;

export async function loginUser(phone: string, password: string) {
  await applySession(await apiLogin(phone, password));
}
export async function telegramLogin(initData: string) {
  await applySession(await telegramAuth(initData));
}
export async function registerUser(dto: RegisterDto) {
  await applySession(await apiRegister(dto));
}
export function logoutUser() {
  setToken(null);
  clearBusinessId();
  // Mehmon sifatida ro'yxatdagi user id'si bilan /agent/request yuborilsa API 401 beradi: yangi mehmon id.
  try {
    localStorage.setItem("botir.userId", crypto.randomUUID());
  } catch {}
  set({ status: "out", user: null });
}

export function useAuth(): AuthState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
  useEffect(() => {
    void init();
  }, []);
  return s;
}
