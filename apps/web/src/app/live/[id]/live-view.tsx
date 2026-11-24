"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NegotiationStage, OfferCard } from "@/components/negotiation";
import { useNegotiation } from "@/hooks/use-negotiation";
import { acceptOffer, getProducts, recallSession } from "@/lib/api";
import { DEMO_BUSINESSES, SCENARIOS, scenarioKey } from "@/lib/mock";
import type { AcceptResult, Product } from "@/lib/types";

export function LiveView({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Session key={attempt} id={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Session({ id, onRetry }: { id: string; onRetry: () => void }) {
  const state = useNegotiation(id);
  const [meta, setMeta] = useState<{ products: Product[]; request: string; bizName?: string } | null>(null);
  const [accept, setAccept] = useState<AcceptResult | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const s = recallSession(id);
    const key = scenarioKey(id);
    const bizName = s?.businessName ?? DEMO_BUSINESSES.find((b) => b.id === (s?.businessId ?? key))?.name;
    const request = s?.request ?? SCENARIOS[key].defaultRequest;
    getProducts(s?.businessId ?? key)
      .catch(() => [] as Product[])
      .then((products) => live && setMeta({ products, request, bizName }));
    return () => {
      live = false;
    };
  }, [id]);
  const { products = [], request, bizName } = meta ?? {};

  const offer = useMemo(() => (accept ? { ...state.offer!, status: "accepted" as const } : state.offer), [state.offer, accept]);

  async function onAccept() {
    if (!state.offer || accepting) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      setAccept(await acceptOffer(state.offer.id));
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "Tasdiqlab bo'lmadi, qayta urinib ko'ring");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <p className="text-sm font-medium text-agent">Jonli muzokara</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{bizName ?? "Biznes agenti"} bilan kelishuv</h1>
        {request && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">So'rov: {request}</p>}
      </header>

      {state.error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
          <span className="flex-1">{state.error}</span>
          <Button variant="outline" className="h-11 px-4" onClick={onRetry}>
            <RotateCw className="size-4" aria-hidden="true" /> Qayta ulanish
          </Button>
        </div>
      )}

      <NegotiationStage state={state} businessName={bizName} />

      {state.status === "rejected" || state.status === "timeout" ? (
        <p className="mt-6 rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Agentlar kelisha olmadi. Boshqa biznes bilan urinib ko'ring yoki so'rovni o'zgartiring.
        </p>
      ) : (
        offer && (
          <div className="mt-6 sm:mx-auto sm:max-w-xl">
            <OfferCard
              offer={offer}
              products={products}
              accept={accept}
              accepting={accepting}
              onAccept={onAccept}
              error={acceptError}
            />
          </div>
        )
      )}
    </div>
  );
}
