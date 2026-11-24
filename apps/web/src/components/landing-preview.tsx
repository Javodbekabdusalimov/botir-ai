"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useNegotiation } from "@/hooks/use-negotiation";
import { NegotiationStage, OfferCard } from "@/components/negotiation";
import { DEMO_PRODUCTS } from "@/lib/mock";

/** Landing'dagi jonli muzokara ko'rinishi: har doim skriptli demo. */
export function LandingPreview() {
  const state = useNegotiation("demo-chorsu-preview", true);
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-4 backdrop-blur sm:p-6">
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        <NegotiationStage state={state} businessName="Chorsu Osh Markazi" autoScroll={false} />
      </div>
      {state.offer && (
        <div className="mt-4">
          <OfferCard offer={state.offer} products={DEMO_PRODUCTS.chorsu} accept={null} accepting={false} compact />
        </div>
      )}
      <Link
        href="/live/demo-chorsu"
        className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-agent hover:underline"
      >
        To'liq ekranda ko'rish <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
