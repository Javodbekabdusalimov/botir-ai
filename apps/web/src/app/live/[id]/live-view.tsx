"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NegotiationStage, OfferCard } from "@/components/negotiation";
import { useNegotiation } from "@/hooks/use-negotiation";
import { confirmNegotiation, getBusinesses } from "@/lib/api";
import { ALL_MOCK_BUSINESSES } from "@/lib/mock";
import type { ConfirmResult } from "@/lib/types";

export function LiveView({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Session key={attempt} id={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Session({ id, onRetry }: { id: string; onRetry: () => void }) {
  const state = useNegotiation(id);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(ALL_MOCK_BUSINESSES.map((b) => [b.id, b.name])));
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getBusinesses()
      .then((list) => live && setNames((n) => ({ ...n, ...Object.fromEntries(list.map((b) => [b.id, b.name])) })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Takliflar narx bo'yicha o'sish tartibida; "Boshqasi" keyingisiga o'tkazadi
  const ranked = useMemo(() => Object.values(state.best).sort((a, b) => a.offer.price - b.offer.price), [state.best]);
  const current = ranked.length ? ranked[skip % ranked.length] : null;
  const ready = state.status === "agreed" || state.status === "confirmed";

  async function onConfirm() {
    if (!current || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      setResult(await confirmNegotiation(id, current.businessId));
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Tasdiqlab bo'lmadi, qayta urinib ko'ring");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <p className="text-sm font-medium text-agent">Jonli muzokara</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-4xl">
          {state.order.length > 1 ? `${state.order.length} ta biznes bilan parallel muzokara` : "Agentlar kelishmoqda"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Shaxsiy agentingiz sizning nomingizdan gaplashadi. Yakuniy qaror sizda.</p>
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

      <NegotiationStage state={state} names={names} />

      {state.status === "rejected" || state.status === "failed" ? (
        <p className="mt-6 rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Agentlar kelisha olmadi. Boshqa biznes bilan urinib ko'ring yoki so'rovni o'zgartiring.
        </p>
      ) : (
        current && (
          <div className="mt-6 sm:mx-auto sm:max-w-xl">
            <OfferCard
              best={current}
              ready={ready}
              confirming={confirming}
              result={result}
              error={confirmError}
              onConfirm={onConfirm}
              onOther={() => setSkip((s) => s + 1)}
              othersLeft={ranked.length > 1}
            />
          </div>
        )
      )}
    </div>
  );
}
