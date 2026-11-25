"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAsync kabi, lekin tab ko'rinib turganda har `everyMs` da jimgina qayta so'raydi:
 * oldingi ma'lumot ekranda qoladi (miltillash yo'q), fon so'rovi xatosi ko'rsatilgan ma'lumotni o'chirmaydi.
 */
export function usePolled<T>(key: string, fn: () => Promise<T>, everyMs: number) {
  const [state, setState] = useState<{ k: string; data?: T; error?: string } | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    const load = (silent: boolean) =>
      fnRef.current()
        .then((data) => live && setState({ k: key, data }))
        .catch((e: unknown) => {
          if (!live) return;
          const error = e instanceof Error ? e.message : "Yuklab bo'lmadi";
          setState((s) => (silent && s?.k === key && s.data !== undefined ? s : { k: key, error }));
        });
    void load(false);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, everyMs);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [key, nonce, everyMs]);

  const reload = useCallback(() => {
    setState(null);
    setNonce((n) => n + 1);
  }, []);
  const fresh = state?.k === key;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : undefined, loading: !fresh, reload, refresh: () => setNonce((n) => n + 1) };
}
