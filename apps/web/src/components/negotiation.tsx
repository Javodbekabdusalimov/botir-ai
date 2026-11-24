"use client";

import { useEffect, useRef } from "react";
import { Bot, Building2, Check, CheckCircle2, Copy, Loader2, ShieldCheck, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlaybackState } from "@/hooks/use-negotiation";
import type { AcceptResult, AgentRole, Offer, Product } from "@/lib/types";

export const MAX_ROUNDS = 3;

function Bubble({ role, text, typing }: { role: AgentRole; text?: string; typing?: boolean }) {
  const biz = role === "biz_agent";
  return (
    <div
      className={cn(
        "rise-in col-span-2 max-w-[90%] rounded-2xl border px-4 py-3 text-[15px] leading-relaxed md:col-span-1 md:max-w-full",
        biz
          ? "justify-self-end rounded-tr-sm border-biz/30 bg-biz/10 md:col-start-2"
          : "justify-self-start rounded-tl-sm border-agent/30 bg-agent/10 md:col-start-1",
      )}
    >
      {typing ? (
        <span className="flex h-5 items-center gap-1" role="status" aria-label="Yozmoqda">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("typing-dot size-2 rounded-full", biz ? "bg-biz" : "bg-agent")} />
          ))}
        </span>
      ) : (
        text
      )}
    </div>
  );
}

function ColumnHeader({ side }: { side: "left" | "right" }) {
  const biz = side === "right";
  const Icon = biz ? Building2 : Bot;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
        biz ? "border-biz/30 text-biz" : "border-agent/30 text-agent",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {biz ? "Biznes agenti" : "Mijoz agenti"}
    </div>
  );
}

export function NegotiationStage({
  state,
  businessName,
  className,
  autoScroll = true,
}: {
  state: PlaybackState;
  businessName?: string;
  className?: string;
  autoScroll?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.messages.length, state.typing, state.offer, autoScroll]);
  const rounds = Math.min(MAX_ROUNDS, state.messages.filter((m) => m.role === "biz_agent").length);

  return (
    <section aria-label="Agentlar muzokarasi" className={className}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <ColumnHeader side="left" />
        <div className="relative">
          <ColumnHeader side="right" />
          {businessName && (
            <span className="absolute -bottom-5 right-1 hidden max-w-full truncate text-xs text-muted-foreground md:block">
              {businessName}
            </span>
          )}
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Raund {rounds}/{MAX_ROUNDS}
        </span>
        <span aria-live="polite">
          {state.status === "running" && "Muzokara ketmoqda"}
          {state.status === "agreed" && "Kelishildi"}
          {state.status === "rejected" && "Rad etildi"}
          {state.status === "timeout" && "Vaqt tugadi"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3" aria-live="polite">
        {state.messages.length === 0 && !state.typing && !state.error && (
          <p className="col-span-2 py-8 text-center text-sm text-muted-foreground">Agentlar ulanmoqda...</p>
        )}
        {state.messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text.slice(0, m.shown)} />
        ))}
        {state.typing && <Bubble role={state.typing} typing />}
      </div>
      <div ref={endRef} />
    </section>
  );
}

export function OfferCard({
  offer,
  products,
  accept,
  accepting,
  onAccept,
  error,
  compact,
}: {
  offer: Offer;
  products: Product[];
  accept: AcceptResult | null;
  accepting: boolean;
  onAccept?: () => void;
  error?: string | null;
  compact?: boolean;
}) {
  const rows = offer.items.map((it) => {
    const p = products.find((x) => x.id === it.productId);
    return { key: it.productId, name: p?.name ?? "Mahsulot", unit: p?.unit ?? "", qty: it.qty, sum: (p?.price ?? 0) * it.qty };
  });
  const subtotal = rows.reduce((s, r) => s + r.sum, 0);
  const done = accept !== null;

  return (
    <div className="rise-in rounded-2xl border border-primary/40 bg-card p-4 shadow-[0_0_40px_-10px_var(--agent)] sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Tag className="size-4 text-agent" aria-hidden="true" />
          Yakuniy taklif
        </h2>
        <span className="rounded-full bg-agent/15 px-2.5 py-1 text-xs font-semibold text-agent">
          -{offer.discountPct}% chegirma
        </span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-3 py-2">
            <span>
              {r.name}
              <span className="text-muted-foreground">
                {" "}
                x {r.qty} {r.unit}
              </span>
            </span>
            {subtotal > 0 && <span className="shrink-0 tabular-nums">{formatSom(r.sum)}</span>}
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        {subtotal > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <dt>Chegirmagacha</dt>
            <dd className="tabular-nums line-through">{formatSom(subtotal)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <dt className="font-medium">Jami</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{formatSom(offer.total)}</dd>
        </div>
      </dl>

      {!done && (
        <div className="mt-4">
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={accepting || !onAccept || offer.status !== "proposed"}
            onClick={onAccept}
          >
            {accepting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {accepting ? "Tasdiqlanmoqda..." : "Tasdiqlayman"}
          </Button>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {!compact && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Agent faqat taklif qiladi: to'lov va band qilish sizning tasdig'ingizdan keyin.
            </p>
          )}
        </div>
      )}

      {done && <PaymentBlock result={accept} />}
    </div>
  );
}

function PaymentBlock({ result }: { result: AcceptResult }) {
  const copy = () => {
    try {
      void navigator.clipboard.writeText(result.payUrl);
    } catch {}
  };
  return (
    <div className="mt-4 space-y-3" role="status">
      <p className="flex items-center gap-2 font-semibold text-agent">
        <CheckCircle2 className="size-5" aria-hidden="true" />
        Buyurtma tasdiqlandi
      </p>
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <p className="text-sm font-medium">TezCheck orqali to'lov</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {["Payme", "Click", "Uzum"].map((n) => (
            <span key={n} className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              {n}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 text-xs">{result.payUrl}</code>
          <Button variant="outline" size="icon" className="size-11" onClick={copy} aria-label="Havolani nusxalash">
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Faqat kirim: bitta havola orqali Payme, Click yoki Uzum.</p>
      </div>
    </div>
  );
}
