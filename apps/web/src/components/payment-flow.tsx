"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { getPaymentStatus } from "@/lib/api";
import { savePaidOrder } from "@/lib/orders-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { PayLogos } from "@/components/brand-logos";
import { formatSom, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import type { BestOffer, ConfirmResult } from "@/lib/types";

/** Bir buyurtma uchun to'lov sahifasi faqat bir marta ochiladi (StrictMode / qayta render). */
const OPENED = new Set<string>();

/** Tasdiqdan keyin: to'lov sahifasi ochiladi, har 3s status so'raladi, "To'landi" bo'lsa buyurtma saqlanadi. */
export function PaymentFlow({ result, best }: { result: ConfirmResult; best: BestOffer }) {
  const [status, setStatus] = useState<"pending" | "paid" | "failed" | "expired">("pending");
  const [netError, setNetError] = useState(false);
  const [isTest, setIsTest] = useState(() => result.paymentLink.includes("/pay/test/"));
  const [copied, setCopied] = useState(false);
  const { offer } = best;
  const [paidAt] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    if (OPENED.has(result.orderId)) return; // StrictMode / qayta render: faqat bir marta ochamiz
    OPENED.add(result.orderId);
    try {
      // Loyihaning o'z checkout sahifasi: buyurtma xulosasi sessionStorage orqali uzatiladi
      localStorage.setItem(
        `botir.checkout.${result.orderId}`,
        JSON.stringify({ businessId: best.businessId, businessName: best.businessName, items: offer.items, total: offer.price, discountPct: offer.discountPct, link: result.paymentLink }),
      );
    } catch {}
    haptic("success");
    // Shu tabda: yangi oyna telefonda va Telegram ichida bloklanadi (B4)
    router.push(`/pay/${encodeURIComponent(result.orderId)}`);
  }, [router, result.orderId, result.paymentLink, best.businessId, best.businessName, offer.items, offer.price, offer.discountPct]);

  useEffect(() => {
    if (status !== "pending") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getPaymentStatus(result.orderId);
        if (!alive) return;
        setNetError(false);
        if (typeof r.isTest === "boolean") setIsTest(r.isTest);
        if (r.status !== "pending") {
          setStatus(r.status);
          if (r.status === "paid")
            savePaidOrder({
              orderId: result.orderId,
              businessName: best.businessName,
              items: offer.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
              total: offer.price,
              discountPct: offer.discountPct,
              paidAt: new Date().toISOString(),
              isTest: typeof r.isTest === "boolean" ? r.isTest : result.paymentLink.includes("/pay/test/"),
            });
        }
      } catch {
        if (alive) setNetError(true);
      }
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status, result.orderId, result.paymentLink, best.businessName, offer]);

  const copy = () => {
    try {
      void navigator.clipboard.writeText(result.paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (status === "paid")
    return (
      <div ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="slide-up relative mt-4 overflow-hidden rounded-2xl border border-green-500/40 bg-tint-1 p-5 text-center" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-white">
          <svg viewBox="0 0 24 24" className="check-draw size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="mt-3 font-display text-2xl font-extrabold text-green-900">{isTest ? "TEST to'lov" : "To'landi"}</p>
        <p className="mt-1 text-sm font-medium text-green-900/80">{isTest ? "TEST to'lov: haqiqiy pul o'tmadi" : "TezCheck orqali to'landi"}</p>
        <dl className="mx-auto mt-4 max-w-xs divide-y divide-tint-3 rounded-xl border border-tint-3 bg-card text-left text-sm">
          {[
            ["Summa", formatSom(offer.price)],
            ["Biznes", best.businessName],
            ["Vaqt", formatWhen(new Date(paidAt).toISOString())],
            ["Buyurtma", `#${result.orderId.slice(-6).toUpperCase()}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/assistant" className={cn(buttonVariants(), "mt-4 h-12 w-full text-base font-semibold")}>
          Buyurtmani ko&apos;rish
        </Link>
      </div>
    );

  if (status === "failed" || status === "expired")
    return (
      <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-semibold text-destructive">{status === "expired" ? "To'lov muddati tugadi" : "To'lov amalga oshmadi"}</p>
        <p className="mt-1 text-muted-foreground">Pul yechilmagan. Muzokarani qaytadan boshlab ko&apos;ring.</p>
        <Link href="/assistant" className={cn(buttonVariants({ variant: "outline" }), "mt-3 h-11 px-4")}>
          Yordamchiga qaytish
        </Link>
      </div>
    );

  return (
    <div className="mt-4 space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-tint-3 bg-tint-1 p-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-green-700 motion-reduce:animate-none" aria-hidden="true" />
        <div>
          <p className="font-semibold text-green-900">To&apos;lov kutilmoqda…</p>
          <p className="text-xs text-green-900/80">To&apos;lov sahifasiga o&apos;tilmoqda. Ochilmasa pastdagi tugmani bosing; holat avtomatik yangilanadi.</p>
        </div>
      </div>
      {netError && <p className="text-xs text-destructive">Holatni tekshirib bo&apos;lmadi, qayta urinilmoqda…</p>}
      <div className="rounded-xl border border-border bg-muted/50 p-3">
        <p className="text-sm font-medium">TezCheck orqali to&apos;lov</p>
        <PayLogos className="mt-2" height={16} />
        <div className="mt-3 flex items-center gap-2">
          <a href={`/pay/${result.orderId}`} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 px-3")}>
            <ExternalLink className="size-4" aria-hidden="true" /> To&apos;lov sahifasini ochish
          </a>
          <Button variant="outline" size="icon" className="size-11" onClick={copy} aria-label="Havolani nusxalash">
            {copied ? <Check className="size-4 text-green-700" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Faqat kirim: bitta havola orqali Payme, Click yoki Uzum.</p>
      </div>
    </div>
  );
}
