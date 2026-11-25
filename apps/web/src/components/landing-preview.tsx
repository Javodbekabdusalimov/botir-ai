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
    <div className="relative flex h-[36rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift sm:h-[38rem]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-red-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white/80 px-3 py-1 text-[11px] text-muted-foreground">Namuna muzokara</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex size-2.5">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-agent opacity-60 motion-reduce:animate-none" />}
            <span className={live ? "relative inline-flex size-2.5 rounded-full bg-agent" : "relative inline-flex size-2.5 rounded-full bg-green-500"} />
          </span>
          {live ? "Muzokara ketmoqda" : "Kelishildi"}
        </span>
        <span className="flex items-center gap-1 truncate text-xs font-medium text-green-900"><ShieldCheck className="size-3.5 shrink-0 text-green-800" aria-hidden="true" /> Chegirma limitdan oshmaydi</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_1.25rem)] sm:px-5 [scrollbar-width:none]">
        <NegotiationStage state={state} names={NAMES} autoScroll={false} />
      </div>
      <div className="shrink-0 border-t border-border px-4 pb-3 pt-3 sm:px-5">
        {best && !live ? <OfferCard best={best} ready confirming={false} result={null} compact /> : <p className="py-2 text-center text-sm text-muted-foreground">Agentlar taklif tayyorlamoqda…</p>}
        <Link href="/live/demo-chorsu" className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-agent hover:underline">
          To'liq ekranda ko'rish <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <div className="mt-1 hidden items-center justify-between gap-3 border-t border-border pt-2.5 sm:flex">
          <p className="text-[11px] font-semibold text-muted-foreground">TezCheck orqali to&apos;lov</p>
          <PayLogos height={14} />
        </div>
      </div>
    </div>
    </div>
  );
}
