"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Building2, Check, Copy, ExternalLink, Loader2, Repeat, ShieldCheck, Trophy } from "lucide-react";
import { getPaymentStatus } from "@/lib/api";
import { savePaidOrder } from "@/lib/orders-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { BizAvatar } from "@/components/biz-avatar";
import { PayLogos } from "@/components/brand-logos";
import { formatSom, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { A2AType, BestOffer, ConfirmResult, Lane, NegotiationState } from "@/lib/types";

export const MAX_ROUNDS = 3;

const PAYLOAD: Record<A2AType, { label: string; cls: string }> = {
  REQUEST: { label: "So'rov", cls: "bg-agent/20 text-agent" },
  OFFER: { label: "Taklif", cls: "bg-biz/20 text-biz" },
  COUNTER: { label: "Qarshi taklif", cls: "bg-violet-500/15 text-violet-700" },
  ACCEPT: { label: "Qabul", cls: "bg-green-500/20 text-green-700" },
  REJECT: { label: "Rad", cls: "bg-destructive/20 text-destructive" },
};

function Bubble({ biz, type, text, typing }: { biz: boolean; type?: A2AType; text?: string; typing?: boolean }) {
  return (
    <div
      className={cn(
        "rise-in col-span-2 max-w-[92%] rounded-2xl border px-4 py-3 text-[15px] leading-relaxed md:col-span-1 md:max-w-full",
        biz ? "justify-self-end rounded-tr-sm border-amber-200 bg-biz-soft md:col-start-2" : "justify-self-start rounded-tl-sm border-tint-3 bg-tint-1 md:col-start-1",
      )}
    >
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
        <>
          {type && (
            <span className={cn("mb-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", PAYLOAD[type].cls)} title={PAYLOAD[type].label}>
              {type}
            </span>
          )}
          <p>{text}</p>
        </>
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

function ColumnHeader({ biz, name }: { biz: boolean; name?: string }) {
  const Icon = biz ? Building2 : Bot;
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold", biz ? "border-amber-200 bg-biz-soft text-biz" : "border-tint-3 bg-tint-1 text-agent")}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{biz ? (name ? `Biznes agenti: ${name}` : "Biznes agenti") : "Mijoz agenti"}</span>
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
      <div className="mb-3 grid grid-cols-2 gap-2">
        <ColumnHeader biz={false} />
        <ColumnHeader biz name={active ? nameOf(active) : undefined} />
      </div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <RoundProgress round={Math.min(lane?.round ?? 0, MAX_ROUNDS)} done={state.status === "agreed" || state.status === "confirmed"} />
        <span aria-live="polite">
          {state.status === "running" && "Muzokara ketmoqda"}
          {state.status === "agreed" && "Kelishildi"}
          {state.status === "confirmed" && "Tasdiqlandi"}
          {state.status === "rejected" && "Rad etildi"}
          {state.status === "failed" && "Xatolik"}
        </span>
      </div>
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-3" aria-live="polite">
        {!lane && !state.error && <p className="col-span-2 py-8 text-center text-sm text-muted-foreground">Agentlar ulanmoqda...</p>}
        {lane?.messages.map((m) => (
          <Bubble key={m.id} biz={m.fromAgent === "business"} type={m.payload.type} text={m.text.slice(0, m.shown)} />
        ))}
        {lane?.typing && <Bubble biz={lane.typing === "business"} typing />}
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
  const subtotal = offer.items.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="slide-up rounded-2xl border border-primary/50 bg-card p-4 shadow-lift sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="size-4 text-biz" aria-hidden="true" />
          {ready ? "Eng yaxshi taklif" : "Joriy eng yaxshi taklif"}
        </h2>
        {offer.discountPct > 0 && <span key={offer.discountPct} className="pop-in shrink-0 rounded-full bg-agent/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-agent">-{offer.discountPct}%</span>}
      </div>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <BizAvatar id={best.businessId} name={best.businessName} size={28} />
        {best.businessName}
      </p>
      <ul className={cn("divide-y divide-border text-sm", compact && "hidden")}>
        {offer.items.map((i) => (
          <li key={i.catalogItemId} className="flex items-start justify-between gap-3 py-2">
            <span>
              {i.name}
              <span className="text-muted-foreground"> x {i.qty}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatSom(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <PriceBlock price={offer.price} subtotal={subtotal} discountPct={offer.discountPct} compact={compact} />
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
  );
}

/** Narx o'zgarsa: eski narx chiziladi, yangisi pastdan chiqadi (270 000 -> ~~270 000~~ 256 500). */
function PriceBlock({ price, subtotal, discountPct, compact }: { price: number; subtotal: number; discountPct: number; compact?: boolean }) {
  const [track, setTrack] = useState<{ price: number; prev: number | null }>({ price, prev: null });
  if (track.price !== price) setTrack({ price, prev: track.price });
  const struck = track.prev ?? (discountPct > 0 ? subtotal : null);
  return (
    <div className={cn("flex items-end justify-between gap-3", compact ? "mt-1" : "mt-3 border-t border-border pt-3")}>
      <span className="pb-1 text-sm font-medium">Jami</span>
      <div className="text-right" aria-live="polite">
        {struck !== null && struck !== price && (
          <div key={`s${struck}`} className="strike text-sm tabular-nums">
            {formatSom(struck)}
          </div>
        )}
        <div key={price} className="price-in font-display text-2xl font-bold tabular-nums text-green-800">
          {formatSom(price)}
        </div>
      </div>
    </div>
  );
}

const OPENED = new Set<string>();

/** Tasdiqdan keyin: to'lov sahifasi ochiladi, har 3s status so'raladi, "To'landi" bo'lsa buyurtma saqlanadi. */
function PaymentFlow({ result, best }: { result: ConfirmResult; best: BestOffer }) {
  const [status, setStatus] = useState<"pending" | "paid" | "failed" | "expired">("pending");
  const [netError, setNetError] = useState(false);
  const [copied, setCopied] = useState(false);
  const { offer } = best;
  const [paidAt] = useState(() => Date.now());

  useEffect(() => {
    if (OPENED.has(result.orderId)) return; // StrictMode / qayta render: faqat bir marta ochamiz
    OPENED.add(result.orderId);
    try {
      window.open(result.paymentLink, "_blank", "noopener");
    } catch {}
  }, [result.orderId, result.paymentLink]);

  useEffect(() => {
    if (status !== "pending") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getPaymentStatus(result.orderId);
        if (!alive) return;
        setNetError(false);
        if (r.status !== "pending") {
          setStatus(r.status);
          if (r.status === "paid")
            savePaidOrder({
              orderId: result.orderId,
              businessName: best.businessName,
              items: offer.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
              total: offer.price,
              discountPct: offer.discountPct,
              paidAt: new Date().toISOString(),
            });
        }
      } catch {
        if (alive) setNetError(true);
      }
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status, result.orderId, best.businessName, offer]);

  const copy = () => {
    try {
      void navigator.clipboard.writeText(result.paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (status === "paid")
    return (
      <div ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="slide-up mt-4 rounded-2xl border border-green-500/40 bg-tint-1 p-5 text-center" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-green-950">
          <svg viewBox="0 0 24 24" className="check-draw size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="mt-3 font-display text-2xl font-extrabold text-green-900">To&apos;landi ✅</p>
        <p className="mt-1 text-sm font-medium text-green-900/80">TezCheck orqali to&apos;landi</p>
        <dl className="mx-auto mt-4 max-w-xs divide-y divide-tint-3 rounded-xl border border-tint-3 bg-card text-left text-sm">
          {[
            ["Summa", formatSom(offer.price)],
            ["Biznes", best.businessName],
            ["Vaqt", formatWhen(new Date(paidAt).toISOString())],
            ["Buyurtma", `#${result.orderId.slice(-6).toUpperCase()}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/assistant" className={cn(buttonVariants(), "mt-4 h-12 w-full text-base font-semibold")}>
          Buyurtmani ko&apos;rish
        </Link>
      </div>
    );

  if (status === "failed" || status === "expired")
    return (
      <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-semibold text-destructive">{status === "expired" ? "To'lov muddati tugadi" : "To'lov amalga oshmadi"}</p>
        <p className="mt-1 text-muted-foreground">Pul yechilmagan. Muzokarani qaytadan boshlab ko&apos;ring.</p>
        <Link href="/assistant" className={cn(buttonVariants({ variant: "outline" }), "mt-3 h-11 px-4")}>
          Yordamchiga qaytish
        </Link>
      </div>
    );

  return (
    <div className="mt-4 space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-tint-3 bg-tint-1 p-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-green-700 motion-reduce:animate-none" aria-hidden="true" />
        <div>
          <p className="font-semibold text-green-900">To&apos;lov kutilmoqda…</p>
          <p className="text-xs text-green-900/80">To&apos;lov sahifasi ochildi. To&apos;lagach bu yerga qaytasiz, holat avtomatik yangilanadi.</p>
        </div>
      </div>
      {netError && <p className="text-xs text-destructive">Holatni tekshirib bo&apos;lmadi, qayta urinilmoqda…</p>}
      <div className="rounded-xl border border-border bg-muted/50 p-3">
        <p className="text-sm font-medium">TezCheck orqali to&apos;lov</p>
        <PayLogos className="mt-2" height={16} />
        <div className="mt-3 flex items-center gap-2">
          <a href={result.paymentLink} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 px-3")}>
            <ExternalLink className="size-4" aria-hidden="true" /> To&apos;lov sahifasini ochish
          </a>
          <Button variant="outline" size="icon" className="size-11" onClick={copy} aria-label="Havolani nusxalash">
            {copied ? <Check className="size-4 text-green-700" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Faqat kirim: bitta havola orqali Payme, Click yoki Uzum.</p>
      </div>
    </div>
  );
}
