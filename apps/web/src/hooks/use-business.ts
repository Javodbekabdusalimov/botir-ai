"use client";

import { useSyncExternalStore } from "react";

const KEY = "botir.businessId";
const EVT = "botir:business";
export const DEFAULT_BUSINESS = "biz-osh";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}

function snapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_BUSINESS;
  } catch {
    return DEFAULT_BUSINESS;
  }
}

export function setBusinessId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

/** Tanlangan biznes (connect'dan keyin saqlanadi, aks holda "biz-osh"). */
export function useBusinessId(): string {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_BUSINESS);
}
