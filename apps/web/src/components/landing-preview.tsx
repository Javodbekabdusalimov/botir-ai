"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { PayLogos } from "@/components/brand-logos";
import { useNegotiation } from "@/hooks/use-negotiation";
import { NegotiationStage, OfferCard } from "@/components/negotiation";

const NAMES = { chorsu: "Chilonzor Osh Markazi" };

/** Landing'dagi jonli muzokara ko'rinishi: har doim skriptli demo (bitta biznes). Balandligi qat'iy: layout sakramaydi. */
export function LandingPreview() {
  const state = useNegotiation("demo-chorsu-preview", true);
  const best = state.best.chorsu;
  const lane = state.lanes.chorsu;
  const scroller = useRef<HTMLDivElement>(null);
  const len = lane?.messages.length ?? 0;
  const shown = lane?.messages[len - 1]?.shown ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [len, shown, lane?.typing, best]);
  const live = state.status === "running";
  return (
    <div className="relative">
    <div className="relative flex h-[36rem] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lift sm:h-[38rem]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-red-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-muted-foreground">botir.ai/live/chilonzor-osh</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex size-2.5">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-agent opacity-60 motion-reduce:animate-none" />}
            <span className={live ? "relative inline-flex size-2.5 rounded-full bg-agent" : "relative inline-flex size-2.5 rounded-full bg-green-500"} />
          </span>
          {live ? "Jonli muzokara" : "Kelishildi"}
        </span>
        <span className="truncate text-xs text-muted-foreground">Chilonzor Osh Markazi</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_1.25rem)] sm:px-5 [scrollbar-width:none]">
        <NegotiationStage state={state} names={NAMES} autoScroll={false} />
      </div>
      <div className="shrink-0 border-t border-border px-4 pb-3 pt-3 sm:px-5">
        {best && !live ? <OfferCard best={best} ready confirming={false} result={null} compact /> : <p className="py-2 text-center text-sm text-muted-foreground">Agentlar taklif tayyorlamoqda…</p>}
        <Link href="/live/demo-chorsu" className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-agent hover:underline">
          To'liq ekranda ko'rish <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
      <div className="pop-in absolute -right-3 top-16 hidden rounded-2xl border border-tint-3 bg-white/90 px-3 py-2 text-xs font-semibold text-green-900 shadow-soft backdrop-blur sm:flex sm:items-center sm:gap-1.5 lg:-right-6">
        <ShieldCheck className="size-4 text-green-600" aria-hidden="true" /> PolicyGuard: chegirma ≤ limit
      </div>
      <div className="slide-up absolute -bottom-5 -left-3 hidden rounded-2xl border border-border bg-white/95 p-3 shadow-soft backdrop-blur sm:block lg:-left-8">
        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">TezCheck orqali to&apos;lov</p>
        <PayLogos height={16} />
      </div>
    </div>
  );
}
