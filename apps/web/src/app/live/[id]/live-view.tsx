"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, MessageSquareText, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NegotiationStage, OfferCard } from "@/components/negotiation";
import { useNegotiation } from "@/hooks/use-negotiation";
import { agentRequest, confirmNegotiation, getBusinesses, recallRequestText } from "@/lib/api";
import { ALL_MOCK_BUSINESSES } from "@/lib/mock";
import type { ConfirmResult } from "@/lib/types";

export function LiveView({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Session key={attempt} id={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Session({ id, onRetry }: { id: string; onRetry: () => void }) {
  const state = useNegotiation(id);
  const confirmFor = useSearchParams().get("confirm");
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(ALL_MOCK_BUSINESSES.map((b) => [b.id, b.name])));
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  // Kelishilmadi: o'sha so'rovni qaytadan yuboramiz (yangi muzokara)
  async function retryRequest() {
    const text = recallRequestText(id);
    if (!text) return router.push("/assistant");
    setRetrying(true);
    try {
      const r = await agentRequest(text);
      router.push(`/live/${r.negotiationId}`);
    } catch {
      setRetrying(false);
      router.push("/assistant");
    }
  }

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
  const forced = confirmFor && skip === 0 ? ranked.find((b) => b.businessId === confirmFor) : undefined;
  const current = forced ?? (ranked.length ? ranked[skip % ranked.length] : null);
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
    <div className="mx-auto flex max-w-[1200px] flex-col px-4 py-5 lg:h-[calc(100dvh-2.9rem)] lg:py-6">
      <header className="mb-4 shrink-0">
        <p className="text-sm font-medium text-agent">Agentlar muzokarasi</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {state.status === "rejected" || state.status === "failed"
            ? "Muzokara yakunlandi"
            : state.order.length > 1
              ? `${state.order.length} ta biznes bilan parallel muzokara`
              : "Agentlar kelishmoqda"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Shaxsiy agentingiz sizning nomingizdan gaplashadi. Yakuniy qaror sizda.</p>
      </header>

      {state.error && (
        <div role="alert" className="mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
          <span className="flex-1">{state.error}</span>
          <Button variant="outline" className="h-11 px-4" onClick={onRetry}>
            <RotateCw className="size-4" aria-hidden="true" /> Qayta ulanish
          </Button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-h-0 lg:overflow-y-auto lg:pr-2">
          <NegotiationStage state={state} names={names} initialLane={confirmFor ?? undefined} />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            🛡 Narx katalogdan, chegirma ≤ limit · PolicyGuard · Pul faqat tasdiqdan keyin
          </p>
        </div>

        <div className="min-h-0 lg:overflow-y-auto lg:pb-2">
          {state.status === "rejected" || state.status === "failed" ? (
            <div role="status" className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-sm">
              <p className="font-display text-base font-bold text-amber-900">Bu safar kelishuv bo&apos;lmadi</p>
              <p className="mt-1.5 text-amber-900/80">
                {state.status === "failed"
                  ? "Agent javobi kechikdi yoki uzildi. Hech qanday pul yechilmadi — so'rovni qayta yuborsangiz, agentlar yangidan boshlaydi."
                  : "Biznes narx yoki vaqt bo'yicha shartlaringizga rozi bo'lmadi. Hech qanday pul yechilmadi — qayta urinib ko'ring yoki so'rovni biroz o'zgartiring."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="h-11 px-4" onClick={retryRequest} disabled={retrying}>
                  <RotateCw className={retrying ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} aria-hidden="true" />
                  {retrying ? "Yuborilmoqda…" : "Qayta urinish"}
                </Button>
                <Link href="/assistant" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
                  <MessageSquareText className="size-4" aria-hidden="true" /> So&apos;rovni o&apos;zgartirish
                </Link>
              </div>
            </div>
          ) : current ? (
            <OfferCard
              key={ready ? "final" : "live"}
              focusConfirm={!!confirmFor}
              best={current}
              ready={ready}
              confirming={confirming}
              result={result}
              error={confirmError}
              onConfirm={onConfirm}
              onOther={() => setSkip((s) => s + 1)}
              othersLeft={ranked.length > 1}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-tint-3 bg-tint-1/50 p-5 text-center text-sm text-muted-foreground" role="status">
              <div className="shimmer mx-auto mb-3 h-5 w-1/2 rounded" />
              Agentlar taklif tayyorlamoqda…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
