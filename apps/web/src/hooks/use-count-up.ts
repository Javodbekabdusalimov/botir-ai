"use client";

import { useEffect, useState } from "react";

/** Raqam 0 dan target gacha ~700ms ichida sanaladi (reduced-motion bo'lsa darhol). */
export function useCountUp(target: number | undefined, ms = 700): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setV(target), 0);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target === undefined ? 0 : v;
}
