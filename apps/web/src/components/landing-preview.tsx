"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useNegotiation } from "@/hooks/use-negotiation";
import { NegotiationStage, OfferCard } from "@/components/negotiation";

const NAMES = { chorsu: "Chorsu Osh Markazi" };

/** Landing'dagi jonli muzokara ko'rinishi: har doim skriptli demo (bitta biznes). */
export function LandingPreview() {
  const state = useNegotiation("demo-chorsu-preview", true);
  const best = state.best.chorsu;
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-4 backdrop-blur sm:p-6">
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        <NegotiationStage state={state} names={NAMES} autoScroll={false} />
      </div>
      {best && state.status !== "running" && (
        <div className="mt-4">
          <OfferCard best={best} ready confirming={false} result={null} compact />
        </div>
      )}
      <Link href="/live/demo-chorsu" className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-agent hover:underline">
        To'liq ekranda ko'rish <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
