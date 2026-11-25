"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { TG_SCRIPT, inTelegramHint, markTelegram, tg } from "@/lib/telegram";

/** Orqaga tugmasi kerak bo'lmagan "bosh" sahifalar. */
const ROOTS = new Set(["/", "/tg", "/assistant", "/dashboard"]);
const BG = "#e3e7e3";

/**
 * Telegram ichida ochilganda: skriptni yuklaydi, ready/expand, header va fon rangini saytga moslaydi,
 * ichki sahifalarda Telegram'ning "Orqaga" tugmasini yoqadi, <html data-tg> qo'yadi (sayt headeri yashiriladi).
 * Oddiy brauzerda hech narsa qilmaydi va skript yuklanmaydi.
 */
export function TelegramShell() {
  const [want, setWant] = useState(false);
  const [ready, setReady] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage/hash faqat klientda o'qiladi
    if (inTelegramHint() || path === "/tg") setWant(true);
  }, [path]);

  useEffect(() => {
    if (!ready) return;
    const w = tg();
    if (!w) return;
    markTelegram();
    document.documentElement.dataset.tg = "1";
    try {
      w.ready();
      w.expand();
      w.setHeaderColor(BG);
      w.setBackgroundColor(BG);
    } catch {}
  }, [ready]);

  useEffect(() => {
    const w = ready ? tg() : null;
    if (!w) return;
    const back = () => router.back();
    if (ROOTS.has(path)) {
      w.BackButton.hide();
      return;
    }
    w.BackButton.show();
    w.BackButton.onClick(back);
    return () => w.BackButton.offClick(back);
  }, [ready, path, router]);

  if (!want) return null;
  return <Script src={TG_SCRIPT} strategy="afterInteractive" onReady={() => setReady(true)} />;
}
