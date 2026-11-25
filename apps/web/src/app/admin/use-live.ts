"use client";

import { useEffect, useState } from "react";

/**
 * Polling uchun yuklash: `key` yoki `tick` o'zgarsa qayta so'raydi, lekin oldingi ma'lumot ko'rinib turadi (miltillamaydi).
 * Xatoda oxirgi ma'lumot qoladi va `error` beriladi; keyingi muvaffaqiyatli javob xatoni tozalaydi.
 */
export function useLive<T>(key: string, fn: () => Promise<T>, tick: number) {
  const [state, setState] = useState<{ key?: string; data?: T; error?: unknown }>({});
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ key, data }),
      (error: unknown) => live && setState((s) => ({ key, data: s.key === key ? s.data : undefined, error })),
    );
    return () => {
      live = false;
    };
    // fn har renderda yangi; key va tick yetarli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const fresh = state.key === key;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : undefined, loading: !fresh };
}
