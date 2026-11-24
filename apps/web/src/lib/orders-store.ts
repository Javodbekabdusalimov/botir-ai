"use client";

import { useSyncExternalStore } from "react";
import type { OrderItem } from "./types";

/** To'langan buyurtmalar (mijoz brauzerida): /assistant'da buyurtma kartasi uchun. */
export interface PaidOrder {
  orderId: string;
  businessName: string;
  items: Pick<OrderItem, "name" | "qty" | "price">[];
  total: number;
  discountPct: number;
  paidAt: string;
}

const KEY = "botir.paidOrders";
const EVT = "botir:orders";
let cacheRaw: string | null = null;
let cacheVal: PaidOrder[] = [];
const EMPTY: PaidOrder[] = [];

function read(): PaidOrder[] {
  try {
    const raw = localStorage.getItem(KEY) ?? "[]";
    if (raw !== cacheRaw) {
      cacheRaw = raw;
      cacheVal = JSON.parse(raw) as PaidOrder[];
    }
    return cacheVal;
  } catch {
    return EMPTY;
  }
}

export function savePaidOrder(o: PaidOrder) {
  try {
    const list = read().filter((x) => x.orderId !== o.orderId);
    localStorage.setItem(KEY, JSON.stringify([o, ...list].slice(0, 20)));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

export function usePaidOrders(): PaidOrder[] {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => EMPTY,
  );
}
