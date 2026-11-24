"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useNegotiation } from "@/hooks/use-negotiation";
import { NegotiationStage, OfferCard } from "@/components/negotiation";

const NAMES = { chorsu: "Chorsu Osh Markazi" };

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
    <div className="relative flex h-[34rem] flex-col rounded-3xl border border-border bg-card/70 shadow-[0_30px_80px_-30px_var(--agent)] backdrop-blur sm:h-[36rem]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex size-2.5">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-agent opacity-60 motion-reduce:animate-none" />}
            <span className={live ? "relative inline-flex size-2.5 rounded-full bg-agent" : "relative inline-flex size-2.5 rounded-full bg-emerald-400"} />
          </span>
          {live ? "Jonli muzokara" : "Kelishildi"}
        </span>
        <span className="truncate text-xs text-muted-foreground">Chorsu Osh Markazi</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 [scrollbar-width:none]">
        <NegotiationStage state={state} names={NAMES} autoScroll={false} />
      </div>
      <div className="shrink-0 border-t border-border px-4 pb-3 pt-3 sm:px-5">
        {best && !live ? <OfferCard best={best} ready confirming={false} result={null} compact /> : <p className="py-2 text-center text-sm text-muted-foreground">Agentlar taklif tayyorlamoqda…</p>}
        <Link href="/live/demo-chorsu" className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-agent hover:underline">
          To'liq ekranda ko'rish <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
