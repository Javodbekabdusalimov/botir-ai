"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Server ma'lumotini yuklash: `{ data, error, loading, reload }`.
 * `key` o'zgarsa yoki `reload()` chaqirilsa qayta yuklanadi; eskirgan so'rov natijasi (race) e'tiborga olinmaydi.
 * Eslatma: `fn` har renderda yangi bo'lishi mumkin, shuning uchun faqat `key` ga tayanadi.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState<{ k: string; data?: T; error?: string } | null>(null);
  const k = `${key}#${nonce}`;

  useEffect(() => {
    let live = true;
    fn()
      .then((data) => live && setRes({ k, data }))
      .catch((e) => live && setRes({ k, error: e instanceof Error ? e.message : "Yuklab bo'lmadi" }));
    return () => {
      live = false;
    };
    // fn har renderda yangi; key o'zgarishi yetarli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const fresh = res?.k === k;
  return { data: fresh ? res.data : undefined, error: fresh ? res.error : undefined, loading: !fresh, reload };
}
