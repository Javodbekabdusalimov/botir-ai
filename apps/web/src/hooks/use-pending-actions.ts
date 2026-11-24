"use client";

import { useEffect, useState } from "react";
import { getActions } from "@/lib/api";

/** Mijoz uchun: AI ruxsat so'ragan (pending) amallar soni. Har 20s yangilanadi. */
export function usePendingActions(enabled: boolean, refreshKey?: unknown): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      getActions()
        .then((l) => alive && setN(l.filter((a) => a.status === "pending").length))
        .catch(() => {});
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, refreshKey]);
  return enabled ? n : 0;
}
