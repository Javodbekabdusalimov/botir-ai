"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Repeat, ShieldCheck, Trophy } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BizAvatar } from "@/components/biz-avatar";
import { PriceBlock } from "@/components/price-block";
import { bizPhoto } from "@/lib/photos";
import { formatSom, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PaymentFlow } from "@/components/payment-flow";
import type { A2AType, BestOffer, ConfirmResult, Lane, NegotiationState } from "@/lib/types";

export const MAX_ROUNDS = 3;

const PAYLOAD: Record<A2AType, { label: string; cls: string }> = {
  REQUEST: { label: "So'rov", cls: "bg-agent/15 text-green-900" },
  OFFER: { label: "Taklif", cls: "bg-biz/15 text-amber-900" },
  COUNTER: { label: "Qarshi taklif", cls: "bg-amber-100 text-amber-900" },
  ACCEPT: { label: "Qabul", cls: "bg-green-500/20 text-green-700" },
  REJECT: { label: "Rad", cls: "bg-destructive/20 text-destructive" },
};

/** Mijoz agenti avatari (landing/live: bitta shaxsiy agent). */
const CUSTOMER_PHOTO = "/photos/customer.jpg";

function Avatar({ src, alt, size }: { src: string; alt: string; size: number }) {
  return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} className="shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />;
}

function Bubble({ biz, type, text, typing, name, photo }: { biz: boolean; type?: A2AType; text?: string; typing?: boolean; name: string; photo: string }) {
  return (
    <div
      className={cn(
        "rise-in col-span-2 max-w-[92%] rounded-2xl border px-3.5 py-3 text-[15px] leading-relaxed shadow-sm md:col-span-1 md:max-w-full",
        biz ? "justify-self-end rounded-tr-sm border-amber-200 bg-gradient-to-br from-biz-soft to-white md:col-start-2" : "justify-self-start rounded-tl-sm border-tint-3 bg-gradient-to-br from-tint-1 to-white md:col-start-1",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar src={photo} alt="" size={22} />
        <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{name}</span>
        {type && !typing && (
          <span className={cn("ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold", PAYLOAD[type].cls)}>{PAYLOAD[type].label}</span>
        )}
      </div>
      {typing ? (
        <span className="flex h-5 items-center gap-2" role="status" aria-label="Yozmoqda">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn("typing-dot size-2 rounded-full", biz ? "bg-biz" : "bg-agent")} />
            ))}
          </span>
          <span className="text-xs text-muted-foreground">yozmoqda…</span>
        </span>
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}

function RoundProgress({ round, done }: { round: number; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5" role="progressbar" aria-label="Raund" aria-valuemin={0} aria-valuemax={MAX_ROUNDS} aria-valuenow={round}>
      <span className="font-medium tabular-nums text-foreground">
        Raund {round}/{MAX_ROUNDS}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: MAX_ROUNDS }, (_, i) => (
          <span key={i} className="h-1.5 w-8 overflow-hidden rounded-full bg-muted sm:w-10">
            <span
              className={cn("block h-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none", done ? "bg-green-500" : "bg-agent")}
              style={{ transform: `scaleX(${i < round ? 1 : 0})` }}
            />
          </span>
        ))}
      </span>
    </div>
  );
}

function AgentChip({ photo, title, subtitle, tone, align }: { photo: string; title: string; subtitle: string; tone: "agent" | "biz"; align: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <span className={cn("rounded-full p-0.5", tone === "agent" ? "bg-gradient-to-br from-green-400 to-green-700" : "bg-gradient-to-br from-amber-300 to-amber-600")}>
        <Avatar src={photo} alt="" size={40} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight">{title}</span>
        <span className={cn("hidden truncate text-xs sm:block", tone === "agent" ? "text-agent" : "text-biz")}>{subtitle}</span>
      </span>
    </div>
  );
}

/** Ikki agent va ular orasidagi jonli oqim: muzokara ketayotganda nuqtalar chapdan o'ngga siljiydi. */
function Arena({ bizName, bizPhotoSrc, running }: { bizName?: string; bizPhotoSrc: string; running: boolean }) {
  return (
    <div className="glass mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-2xl p-3 sm:gap-4 sm:p-4">
      <AgentChip photo={CUSTOMER_PHOTO} title="Mijoz agenti" subtitle="Shaxsiy yordamchi" tone="agent" align="left" />
      <div className="relative h-6 w-14 overflow-hidden [container-type:inline-size] sm:w-28" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-green-400 via-tint-3 to-amber-400" />
        {running && (
          <span className="absolute inset-0">
            {[0, 1, 2].map((i) => (
              <i key={i} className="flow-dot absolute left-0 top-1/2 -mt-[3px] size-1.5 rounded-full bg-green-600" style={{ ["--flow-d" as string]: "calc(100cqw - 6px)" }} />
            ))}
          </span>
        )}
      </div>
      <AgentChip photo={bizPhotoSrc} title={bizName ?? "Biznes agenti"} subtitle="Biznes agenti" tone="biz" align="right" />
    </div>
  );
}

export function NegotiationStage({
  state,
  names,
  className,
  autoScroll = true,
  initialLane,
}: {
  state: NegotiationState;
  names: Record<string, string>;
  className?: string;
  autoScroll?: boolean;
  /** /live/:id?confirm=<businessId>: shu biznes tabi tanlangan holda ochiladi */
  initialLane?: string;
}) {
  const [picked, setPicked] = useState<string | null>(initialLane ?? null);
  const active = picked && state.lanes[picked] ? picked : state.order[0];
  const lane: Lane | undefined = active ? state.lanes[active] : undefined;
  const endRef = useRef<HTMLDivElement>(null);
  const len = lane?.messages.length ?? 0;
  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [len, lane?.typing, active, autoScroll]);

  const nameOf = (id: string) => names[id] ?? state.best[id]?.businessName ?? "Biznes";
  const multi = state.order.length > 1;

  return (
    <section aria-label="Agentlar muzokarasi" className={className}>
      {multi && (
        <div role="tablist" aria-label="Bizneslar" className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {state.order.map((id) => {
            const l = state.lanes[id];
            const sel = id === active;
            const b = state.best[id];
            return (
              <button
                key={id}
                role="tab"
                aria-selected={sel}
                onClick={() => setPicked(id)}
                className={cn("min-h-11 shrink-0 rounded-xl border px-3 py-1.5 text-left text-sm", sel ? "border-primary bg-tint-1 shadow-sm" : "border-border bg-card text-muted-foreground hover:text-foreground")}
              >
                <span className="flex items-center gap-2 font-medium">
                  <BizAvatar id={id} name="" size={24} />
                  {l.typing && <span className="size-1.5 animate-pulse rounded-full bg-biz" />}
                  {nameOf(id)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Raund {Math.min(l.round, MAX_ROUNDS)}/{MAX_ROUNDS}
                  {b && ` · ${formatSom(b.offer.price)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Arena bizName={active ? nameOf(active) : undefined} bizPhotoSrc={bizPhoto(active ?? "")} running={state.status === "running"} />
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <RoundProgress round={Math.min(lane?.round ?? 0, MAX_ROUNDS)} done={state.status === "agreed" || state.status === "confirmed"} />
        <span aria-live="polite">
          {state.status === "running" && "Muzokara ketmoqda"}
          {state.status === "agreed" && "Kelishildi"}
          {state.status === "confirmed" && "Tasdiqlandi"}
          {state.status === "rejected" && "Kelishilmadi"}
          {state.status === "failed" && "Texnik xato"}
        </span>
      </div>
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-3" aria-live="polite">
        {!lane && !state.error && state.status === "running" && <p role="status" className="col-span-2 py-8 text-center text-sm text-muted-foreground">Ulanmoqda… agentlar so&apos;rovni o&apos;qimoqda</p>}
        {lane?.messages.map((m) => (
          <Bubble key={m.id} biz={m.fromAgent === "business"} type={m.payload.type} text={m.text.slice(0, m.shown)} name={m.fromAgent === "business" ? nameOf(m.businessId) : "Mijoz agenti"} photo={m.fromAgent === "business" ? bizPhoto(m.businessId) : CUSTOMER_PHOTO} />
        ))}
        {lane?.typing && <Bubble biz={lane.typing === "business"} typing name={lane.typing === "business" ? nameOf(lane.businessId) : "Mijoz agenti"} photo={lane.typing === "business" ? bizPhoto(lane.businessId) : CUSTOMER_PHOTO} />}
      </div>
      <div ref={endRef} />
    </section>
  );
}

export function OfferCard({
  best,
  ready,
  confirming,
  result,
  error,
  onConfirm,
  onOther,
  othersLeft,
  compact,
  focusConfirm,
}: {
  best: BestOffer;
  /** Muzokara tugagan (status agreed) */
  ready: boolean;
  confirming: boolean;
  result: ConfirmResult | null;
  error?: string | null;
  onConfirm?: () => void;
  onOther?: () => void;
  othersLeft?: boolean;
  compact?: boolean;
  /** Telegram havolasidan kelganda [Tasdiqlayman] fokus oladi */
  focusConfirm?: boolean;
}) {
  const { offer } = best;
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusConfirm && ready && !result) confirmRef.current?.focus();
  }, [focusConfirm, ready, result]);
  return (
    <div className="slide-up overflow-hidden rounded-2xl border border-primary/50 bg-card shadow-lift">
      <div className="relative isolate overflow-hidden px-4 pb-4 pt-4 text-white sm:px-5">
        <Image src={bizPhoto(best.businessId)} alt="" fill sizes="400px" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-green-950/90 via-green-950/60 to-green-900/40" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Trophy className="size-4 text-amber-300" aria-hidden="true" />
            {ready ? "Eng yaxshi taklif" : "Joriy eng yaxshi taklif"}
          </h2>
          {offer.discountPct > 0 && <span key={offer.discountPct} className="pop-in shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-green-900">-{offer.discountPct}%</span>}
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <BizAvatar id={best.businessId} name={best.businessName} size={28} />
          {best.businessName}
        </p>
      </div>
      <div className="p-4 sm:p-5">
      <ul className={cn("divide-y divide-border text-sm", compact && "hidden")}>
        {offer.items.map((i) => (
          <li key={i.catalogItemId} className="flex items-start justify-between gap-3 py-2">
            <span>
              {i.name}
              <span className="text-muted-foreground"> x {i.qty}</span>
            </span>
            <span className="shrink-0 tabular-nums">{i.price * i.qty === 0 ? "Bepul" : formatSom(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <PriceBlock price={offer.price} items={offer.items} compact={compact} />
      {offer.validUntil && <p className="mt-1 text-xs text-muted-foreground">Amal qiladi: {formatWhen(offer.validUntil)} gacha</p>}

      {!result && !compact && (
        <div className="mt-4">
          <div className="flex gap-2">
            <Button ref={confirmRef} size="lg" className="h-12 flex-1 text-base font-semibold" disabled={!ready || confirming || !onConfirm} onClick={onConfirm}>
              {confirming ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {confirming ? "Tasdiqlanmoqda..." : ready ? "Tasdiqlayman" : "Muzokara davom etmoqda"}
            </Button>
            {othersLeft && (
              <Button size="lg" variant="outline" className="h-12 px-4" disabled={confirming} onClick={onOther}>
                <Repeat className="size-4" aria-hidden="true" /> Boshqasi
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Agent faqat taklif qiladi: to'lov va band qilish sizning tasdig'ingizdan keyin.
          </p>
        </div>
      )}
      {result && <PaymentFlow result={result} best={best} />}
      </div>
    </div>
  );
}
