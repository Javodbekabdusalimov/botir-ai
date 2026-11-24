"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getMe, getToken, login as apiLogin, register as apiRegister, setToken } from "@/lib/api";
import { setBusinessId } from "@/hooks/use-business";
import type { AuthResult, AuthUser, RegisterDto } from "@/lib/types";

export interface AuthState {
  /** loading: token tekshirilmoqda (SSR va birinchi render ham shu) */
  status: "loading" | "out" | "in";
  user: AuthUser | null;
}

const SERVER: AuthState = { status: "loading", user: null };
let state: AuthState = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function applySession(r: AuthResult) {
  setToken(r.token);
  if (r.user.businessId) setBusinessId(r.user.businessId);
  set({ status: "in", user: r.user });
}

async function init() {
  if (started) return;
  started = true;
  const token = getToken();
  if (!token) return set({ status: "out", user: null });
  try {
    const { user, businessId } = await getMe(token);
    const u = { ...user, businessId: user.businessId ?? businessId };
    if (u.businessId) setBusinessId(u.businessId);
    set({ status: "in", user: u });
  } catch {
    setToken(null);
    set({ status: "out", user: null });
  }
}

export async function loginUser(phone: string, password: string) {
  applySession(await apiLogin(phone, password));
}
export async function registerUser(dto: RegisterDto) {
  applySession(await apiRegister(dto));
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
