"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, Repeat, ShieldCheck, Trophy } from "lucide-react";
import Image from "next/image";
import { getPaymentStatus } from "@/lib/api";
import { savePaidOrder } from "@/lib/orders-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { BizAvatar } from "@/components/biz-avatar";
import { PayLogos } from "@/components/brand-logos";
import { useCountUp } from "@/hooks/use-count-up";
import { bizPhoto } from "@/lib/photos";
import { formatSom, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  const subtotal = offer.items.reduce((s, i) => s + i.price * i.qty, 0);
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
        <AnimatedPrice price={price} />
      </div>
    </div>
  );
}

/** Narx raqami eski qiymatdan yangisiga sanab o'tadi (reduced-motion: darhol). */
function AnimatedPrice({ price }: { price: number }) {
  const shown = useCountUp(price, 600);
  return (
    <div className="font-display text-2xl font-bold tabular-nums text-green-800" aria-label={formatSom(price)}>
      <span aria-hidden="true">{formatSom(shown)}</span>
    </div>
  );
}


const OPENED = new Set<string>();

/** Tasdiqdan keyin: to'lov sahifasi ochiladi, har 3s status so'raladi, "To'landi" bo'lsa buyurtma saqlanadi. */
function PaymentFlow({ result, best }: { result: ConfirmResult; best: BestOffer }) {
  const [status, setStatus] = useState<"pending" | "paid" | "failed" | "expired">("pending");
  const [netError, setNetError] = useState(false);
  const [isTest, setIsTest] = useState(() => result.paymentLink.includes("/pay/test/"));
  const [copied, setCopied] = useState(false);
  const { offer } = best;
  const [paidAt] = useState(() => Date.now());

  useEffect(() => {
    if (OPENED.has(result.orderId)) return; // StrictMode / qayta render: faqat bir marta ochamiz
    OPENED.add(result.orderId);
    try {
      // Loyihaning o'z checkout sahifasi: buyurtma xulosasi sessionStorage orqali uzatiladi
      localStorage.setItem(
        `botir.checkout.${result.orderId}`,
        JSON.stringify({ businessId: best.businessId, businessName: best.businessName, items: offer.items, total: offer.price, discountPct: offer.discountPct, link: result.paymentLink }),
      );
      window.open(`/pay/${encodeURIComponent(result.orderId)}`, "_blank", "noopener");
    } catch {}
  }, [result.orderId, result.paymentLink, best.businessId, best.businessName, offer.items, offer.price, offer.discountPct]);

  useEffect(() => {
    if (status !== "pending") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getPaymentStatus(result.orderId);
        if (!alive) return;
        setNetError(false);
        if (typeof r.isTest === "boolean") setIsTest(r.isTest);
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
      <div ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="slide-up relative mt-4 overflow-hidden rounded-2xl border border-green-500/40 bg-tint-1 p-5 text-center" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-white">
          <svg viewBox="0 0 24 24" className="check-draw size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="mt-3 font-display text-2xl font-extrabold text-green-900">{isTest ? "TEST to'lov" : "To'landi"}</p>
        <p className="mt-1 text-sm font-medium text-green-900/80">{isTest ? "TEST to'lov: haqiqiy pul o'tmadi" : "TezCheck orqali to'landi"}</p>
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
          <a href={`/pay/${result.orderId}`} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 px-3")}>
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
