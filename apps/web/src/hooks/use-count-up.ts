"use client";

import { useEffect, useRef, useState } from "react";

/** easeOutCubic: tez boshlanadi, yumshoq to'xtaydi. */
const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);

/**
 * Raqam oldingi ko'rsatilgan qiymatdan `target` gacha `ms` ichida sanaladi (birinchi marta 0 dan).
 * Kontrakt: `undefined` target 0 qaytaradi; `prefers-reduced-motion` da darhol sakraydi;
 * target tez-tez o'zgarsa, animatsiya joriy ko'rsatilgan qiymatdan davom etadi (sakrash yo'q).
 */
export function useCountUp(target: number | undefined, ms = 700): number {
  const [v, setV] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (target === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => {
        shown.current = target;
        setV(target);
      }, 0);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const from = shown.current;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      shown.current = Math.round(from + (target - from) * easeOut(p));
      setV(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target === undefined ? 0 : v;
}
