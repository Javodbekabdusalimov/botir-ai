"use client";

import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, MessageSquareText, RotateCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NegotiationStage } from "@/components/negotiation";
import { GroupOffer, groupOffers } from "./group-offer";
import { useNegotiation } from "@/hooks/use-negotiation";
import { agentRequest, getBusinesses, recallRequestText } from "@/lib/api";
import { NEGOTIATION_NOT_FOUND } from "@/lib/api/stream";
import { ALL_MOCK_BUSINESSES } from "@/lib/mock";

/** Jarayon bosqichlari (so'rov, muzokara, taklif, to'lov): holatdan hosil qilinadi, alohida state yo'q. */
const STEPS = ["So'rov", "Muzokara", "Taklif", "To'lov"] as const;

function Stepper({ active }: { active: number }) {
  return (
    <ol className="mt-4 flex items-center gap-1.5 sm:gap-2" aria-label="Jarayon">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-300",
                done ? "bg-green-600 text-white" : current ? "bg-primary text-white ring-4 ring-green-200" : "border border-border bg-white text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("truncate text-xs font-semibold sm:text-sm", current || done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px min-w-3 flex-1 transition-colors duration-300", done ? "bg-green-500" : "bg-border")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Joriy bosqich indeksi: 0 so'rov yuborildi, 1 muzokara, 2 taklif tayyor, 3 to'lov. */
function stepIndex(status: string, hasResult: boolean): number {
  if (hasResult) return 3;
  if (status === "agreed" || status === "confirmed") return 2;
  return 1;
}

export function LiveView({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Session key={attempt} id={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Session({ id, onRetry }: { id: string; onRetry: () => void }) {
  const state = useNegotiation(id);
  const confirmFor = useSearchParams().get("confirm");
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(ALL_MOCK_BUSINESSES.map((b) => [b.id, b.name])));
  const [cats, setCats] = useState<Record<string, string>>(() => Object.fromEntries(ALL_MOCK_BUSINESSES.map((b) => [b.id, b.category])));
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
      .then((list) => {
        if (!live) return;
        setNames((n) => ({ ...n, ...Object.fromEntries(list.map((b) => [b.id, b.name])) }));
        setCats((c) => ({ ...c, ...Object.fromEntries(list.map((b) => [b.id, b.category])) }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Takliflar vazifa (kategoriya) bo'yicha guruhlanadi; har guruh ichida narx o'sish tartibida
  const groups = useMemo(() => groupOffers(state.best, (bid) => cats[bid] ?? "other"), [state.best, cats]);
  const ready = state.status === "agreed" || state.status === "confirmed";
  const notFound = state.error === NEGOTIATION_NOT_FOUND;
  const offersRef = useRef<HTMLDivElement>(null);
  // Telefonda takliflar chat ostida qoladi: kelishilganda "Tasdiqlayman" ga o'zi tushadi (lg da ikki ustun, kerak emas)
  useEffect(() => {
    if (!ready || window.matchMedia("(min-width: 1024px)").matches) return;
    offersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8 py-5 lg:h-[calc(100dvh-5.9rem)] lg:py-6">
      <header className="mb-4 shrink-0">
        <p className="inline-flex items-center gap-2 rounded-full border border-tint-3 bg-white/70 px-3 py-1 text-xs font-semibold text-green-900">
          <span className="size-1.5 rounded-full bg-green-500" aria-hidden="true" /> Agentlar muzokarasi
        </p>
        <h1 className="mt-3 text-balance text-2xl font-bold sm:text-4xl">
          {notFound
            ? "Muzokara topilmadi"
            : state.status === "rejected" || state.status === "failed"
            ? "Muzokara yakunlandi"
            : state.order.length > 1
              ? `${state.order.length} ta biznes bilan parallel muzokara`
              : "Agentlar kelishmoqda"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Shaxsiy agentingiz sizning nomingizdan gaplashadi. Yakuniy qaror sizda.</p>
        <Stepper active={stepIndex(state.status, state.status === "confirmed")} />
        {id.startsWith("demo") && (
          <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <b>Namuna.</b> Bu tayyor ssenariy: bizneslar bilan haqiqiy muzokara va buyurtma yo&apos;q. O&apos;z so&apos;rovingiz uchun{" "}
            <Link href="/assistant" className="font-semibold underline">yordamchiga yozing</Link>.
          </p>
        )}
      </header>

      {state.error && (
        <div role="alert" className="mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
          <span className="flex-1">{friendlyError(state.error)}</span>
          {notFound ? (
            <Link href="/assistant" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:opacity-90">
              Yangi so&apos;rov
            </Link>
          ) : (
            <Button variant="outline" className="h-11 px-4" onClick={onRetry}>
              <RotateCw className="size-4" aria-hidden="true" /> Qayta ulanish
            </Button>
          )}
        </div>
      )}

      {!notFound && (
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-h-0 lg:overflow-y-auto lg:pr-2">
          <NegotiationStage state={state} names={names} initialLane={confirmFor ?? undefined} />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-green-700" aria-hidden="true" /> Narx katalogdan, chegirma limitdan oshmaydi (PolicyGuard). Pul faqat tasdiqdan keyin.
          </p>
        </div>

        <div ref={offersRef} className="min-h-0 scroll-mt-20 lg:overflow-y-auto lg:pb-2">
          {state.status === "rejected" || state.status === "failed" ? (
            <div role="status" className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-sm">
              <p className="font-display text-base font-bold text-amber-900">{state.status === "failed" ? "Texnik xato, qayta urinib ko'ring" : "Agentlar kelisha olmadi"}</p>
              <p className="mt-1.5 text-amber-900/80">
                {state.status === "failed"
                  ? "Server yoki AI javobida uzilish bo'ldi. Hech qanday pul yechilmadi. So'rovni qayta yuborsangiz, agentlar yangidan boshlaydi."
                  : "Biznes narx yoki vaqt bo'yicha shartlaringizga rozi bo'lmadi. Hech qanday pul yechilmadi. Qayta urinib ko'ring yoki so'rovni biroz o'zgartiring."}
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
          ) : groups.length ? (
            <div className="space-y-4">
              {groups.length > 1 && <p className="text-sm font-semibold text-muted-foreground">{groups.length} ta vazifa: har biri alohida tasdiqlanadi</p>}
              {groups.map((g) => (
                <GroupOffer key={g.map((b) => `${b.taskId ?? ""}:${b.businessId}`).join(",")} negotiationId={id} offers={g} ready={ready} focusId={confirmFor} />
              ))}
            </div>
          ) : notFound ? null : (
            <div className="rounded-2xl border border-dashed border-tint-3 bg-tint-1/50 p-5 text-center text-sm text-muted-foreground" role="status">
              <div className="shimmer mx-auto mb-3 h-5 w-1/2 rounded" />
              Agentlar taklif tayyorlamoqda…
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
