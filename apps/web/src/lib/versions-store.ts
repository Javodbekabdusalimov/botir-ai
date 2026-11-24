"use client";

import { useSyncExternalStore } from "react";

/** Tasdiqlangan agent versiyalari tarixi (brauzerda, biznes bo'yicha). Rollback shu ro'yxatdan oxirgisini olib tashlaydi. */
export interface AgentVersion {
  id: string;
  title: string;
  score: number;
  at: string;
}
const EVT = "botir:versions";
const EMPTY: AgentVersion[] = [];
const cache = new Map<string, { raw: string; val: AgentVersion[] }>();
const key = (b: string) => `botir.versions.${b}`;

function read(b: string): AgentVersion[] {
  try {
    const raw = localStorage.getItem(key(b)) ?? "[]";
    const c = cache.get(b);
    if (c && c.raw === raw) return c.val;
    const val = JSON.parse(raw) as AgentVersion[];
    cache.set(b, { raw, val });
    return val;
  } catch {
    return EMPTY;
  }
}
function write(b: string, list: AgentVersion[]) {
  try {
    localStorage.setItem(key(b), JSON.stringify(list.slice(0, 20)));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}
export const addVersion = (b: string, v: AgentVersion) => write(b, [v, ...read(b).filter((x) => x.id !== v.id)]);
export const popVersion = (b: string) => write(b, read(b).slice(1));

export function useVersions(b: string): AgentVersion[] {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => read(b),
    () => EMPTY,
  );
}
