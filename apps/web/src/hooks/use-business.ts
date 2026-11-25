"use client";

import { useSyncExternalStore } from "react";

const KEY = "botir.businessId";
const EVT = "botir:business";
/** Faqat mehmon (kirmagan) uchun namuna biznes. Biznes egasiga hech qachon ko'rsatilmaydi (shell tekshiradi). */
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

/** Biznesni saqlaydi va shu tabdagi `useBusinessId` obunachilarini yangilaydi (`storage` hodisasi faqat boshqa tablarga keladi). */
export function setBusinessId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

/** Chiqishda: keyingi akkaunt eski biznesni ko'rmasin. */
export function clearBusinessId() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

/** Tanlangan biznes (connect'dan keyin saqlanadi, aks holda "biz-osh"). */
export function useBusinessId(): string {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_BUSINESS);
}
