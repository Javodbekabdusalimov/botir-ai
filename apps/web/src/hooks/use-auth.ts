"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getMe, getToken, login as apiLogin, register as apiRegister, setToken } from "@/lib/api";
import { setBusinessId } from "@/hooks/use-business";
import type { AuthResult, AuthUser, MeResponse, RegisterDto } from "@/lib/types";

export interface AuthState {
  /** loading: token tekshirilmoqda (SSR va birinchi render ham shu) */
  status: "loading" | "out" | "in";
  user: AuthUser | null;
  /** Biznes egasining obuna holati (GET /auth/me) */
  business?: MeResponse["business"];
}

const SERVER: AuthState = { status: "loading", user: null };
let state: AuthState = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function applyMe(me: MeResponse) {
  const u = { ...me.user, businessId: me.user.businessId ?? me.businessId };
  if (u.businessId) setBusinessId(u.businessId);
  set({ status: "in", user: u, business: me.business });
}

async function applySession(r: AuthResult) {
  setToken(r.token);
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
  try {
    applyMe(await getMe(token));
  } catch {
    setToken(null);
    set({ status: "out", user: null });
  }
}

export async function loginUser(phone: string, password: string) {
  await applySession(await apiLogin(phone, password));
}
export async function registerUser(dto: RegisterDto) {
  await applySession(await apiRegister(dto));
}
export function logoutUser() {
  setToken(null);
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
