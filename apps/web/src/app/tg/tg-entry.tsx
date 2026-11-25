"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { telegramLogin } from "@/hooks/use-auth";
import { friendlyError } from "@/lib/friendly-error";
import { safeInternalPath, startParamPath, tg } from "@/lib/telegram";

/** Skript yuklanishini kutish chegarasi: shundan keyin initData yo'q = oddiy brauzer. */
const WAIT_MS = 2500;

/**
 * Mini App kirish nuqtasi. Telegram: initData → POST /auth/telegram → token → start_param / ?to= bo'yicha yo'naltirish.
 * Oddiy brauzer (initData yo'q): /assistant ga oddiy rejimda.
 */
export function TgEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const done = useRef(false);

  const go = useCallback(() => {
    const w = tg();
    const dest = safeInternalPath(params.get("to")) ?? startParamPath(w?.initDataUnsafe.start_param ?? params.get("tgWebAppStartParam")) ?? "/assistant";
    router.replace(dest);
  }, [params, router]);

  const enter = useCallback(async () => {
    const w = tg();
    if (!w) return go(); // oddiy brauzer
    setBusy(true);
    setError(null);
    try {
      await telegramLogin(w.initData);
      go();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : null));
      setBusy(false);
    }
  }, [go]);

  useEffect(() => {
    let left = WAIT_MS;
    const t = setInterval(() => {
      left -= 100;
      if (done.current) return;
      if (tg() || left <= 0) {
        done.current = true;
        clearInterval(t);
        void enter();
      }
    }, 100);
    return () => clearInterval(t);
  }, [enter]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center px-4 text-center">
      {busy && !error ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Telegram orqali kirilmoqda…
        </p>
      ) : (
        <div role="alert">
          <p className="font-semibold">Telegram orqali kirib bo&apos;lmadi</p>
          {error && <p className="mt-1 text-sm text-muted-foreground">{error}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => void enter()} className="h-11 px-4 font-semibold">Qayta urinish</Button>
            <Button variant="outline" onClick={() => router.replace("/assistant")} className="h-11 px-4">Kirmasdan davom etish</Button>
          </div>
        </div>
      )}
    </div>
  );
}
