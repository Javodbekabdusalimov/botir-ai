"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Loader2, MapPin, Play, Send, Users, UtensilsCrossed, Wrench } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePaidOrders } from "@/lib/orders-store";
import { Textarea } from "@/components/ui/textarea";
import { UpgradeRequiredError, agentRequest } from "@/lib/api";
import { UpgradeCard } from "@/components/upgrade-card";
import { CATEGORY_LABEL, formatSom, formatWhen } from "@/lib/format";
import type { NegotiationTask } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  from: "me" | "agent";
  text: string;
  tasks?: NegotiationTask[];
  negotiationId?: string;
}

/** Bo'sh holatdagi tayyor so'rovlar: bosilsa matn maydoniga qo'yiladi (yuborilmaydi). */
const STARTERS = [
  { icon: UtensilsCrossed, title: "Guruh uchun osh", text: "Ertaga 6 kishilik osh joy band qil" },
  { icon: Wrench, title: "Avtoservis", text: "Cobalt uchun moy almashtirish, shanba kuni" },
  { icon: CalendarClock, title: "Bir necha vazifa", text: "6 kishilik osh + moy almashtirish" },
] as const;

const EXAMPLES = ["6 kishilik osh + moy almashtirish", "Ertaga diagnostika", "Ertaga 6 kishilik osh joy band qil", "Cobalt uchun moy almashtirish, shanba kuni"];

export function AssistantChat() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "agent", text: "Salom! Men sizning shaxsiy agentingizman. Nima kerak? Men bizneslar bilan o'zim gaplashaman, siz faqat tasdiqlaysiz." },
  ]);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const { status: authStatus, user } = useAuth();
  const orders = usePaidOrders();
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length, busy]);

  async function send(raw: string) {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    setError(null);
    setUpgrade(null);
    setMsgs((m) => [...m, { id: m.length, from: "me", text: t }]);
    setBusy(true);
    try {
      const { tasks, negotiationId } = await agentRequest(t);
      setMsgs((m) => [
        ...m,
        negotiationId
          ? { id: m.length, from: "agent", text: tasks.length === 0 ? "Tushundim. So'rovni bo'laklarga ajratib, bizneslar bilan gaplashishni boshladim." : tasks.length === 1 ? "Tushundim. Bitta vazifa:" : `Tushundim. ${tasks.length} ta vazifaga ajratdim:`, tasks, negotiationId }
          : { id: m.length, from: "agent", text: "Tushunmadim. Nima kerakligini aniqroq ayting: masalan, \"Ertaga 6 kishilik osh joy band qil\"." },
      ]);
    } catch (e) {
      if (e instanceof UpgradeRequiredError) setUpgrade(e.message);
      else setError(e instanceof Error ? e.message : "Agent javob bermadi, qayta urinib ko'ring");
      setText(t); // yozilganini yo'qotmaymiz
    } finally {
      setBusy(false);
    }
  }

  const launchId = msgs.find((m) => m.negotiationId)?.negotiationId;
  useEffect(() => {
    if (!launchId) return;
    // "Agentlar ishga tushdi…" qisqa ko'rsatiladi, keyin avtomatik /live'ga o'tamiz
    const t = setTimeout(() => router.push(`/live/${encodeURIComponent(launchId)}`), 1500);
    return () => clearTimeout(t);
  }, [launchId, router]);

  function start(negotiationId: string) {
    if (starting) return;
    setStarting(true);
    router.push(`/live/${encodeURIComponent(negotiationId)}`);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-2xl flex-col px-4 py-4 sm:h-[calc(100dvh-5.9rem)] sm:py-6">
      <p className="text-sm font-medium text-agent">Shaxsiy agent</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Yordamchingizga ayting</h1>

      {authStatus === "out" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tint-3 bg-tint-1 px-4 py-3 text-sm">
          <span className="text-green-900">Kirsangiz, buyurtmalaringiz saqlanadi. Demo kirishsiz ham ishlaydi.</span>
          <Link href="/login?next=/assistant" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 font-semibold")}>
            Kirish
          </Link>
        </div>
      )}
      {user && <p className="mt-2 text-sm text-muted-foreground">Salom, {user.name}.</p>}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
      {orders.length > 0 && (
        <section aria-label="Buyurtmalaringiz" className="mb-2 space-y-3">
          <h2 className="font-sans text-sm font-bold">Buyurtmalaringiz</h2>
          {orders.map((o) => (
            <article key={o.orderId} className="rounded-2xl border border-green-500/30 bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-bold">{o.businessName}</h3>
                  <p className="text-xs text-muted-foreground">
                    #{o.orderId.slice(-6).toUpperCase()} · {formatWhen(o.paidAt)}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-tint-2 px-2.5 py-1 text-xs font-semibold text-green-900">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" /> To&apos;landi
                </span>
              </div>
              <ul className="mt-2 text-sm text-muted-foreground">
                {o.items.map((i) => (
                  <li key={i.name}>
                    {i.name} x {i.qty}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-display text-lg font-bold tabular-nums">
                {formatSom(o.total)}
                {o.discountPct > 0 && <span className="ml-2 rounded-full bg-tint-2 px-2 py-0.5 align-middle text-xs font-semibold text-green-900">-{o.discountPct}%</span>}
              </p>
            </article>
          ))}
        </section>
      )}


        {msgs.map((m) => (
          <div key={m.id} className={cn("rise-in flex gap-2", m.from === "me" && "justify-end")}>
            {m.from === "agent" && (
              <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-white shadow-soft ring-1 ring-tint-3">
                <LogoMark className="size-5" />
              </span>
            )}
            <div className={cn("max-w-[88%] space-y-3", m.from === "me" && "text-right")}>
              <p className={cn("inline-block rounded-2xl px-4 py-2.5 text-left text-[15px]", m.from === "me" ? "bg-primary/20 text-green-950" : "border border-border bg-card shadow-soft")}>{m.text}</p>
              {m.tasks?.map((t) => (
                <article key={t.taskId} className="rounded-2xl border border-tint-3 bg-card p-4 text-left shadow-soft">
                  <h2 className="font-display text-base font-bold">{CATEGORY_LABEL[t.category] ?? t.category}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.need}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {t.where && (
                      <li className="flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden="true" /> {t.where}
                      </li>
                    )}
                    {t.when && (
                      <li className="flex items-center gap-1">
                        <CalendarClock className="size-3" aria-hidden="true" /> {formatWhen(t.when)}
                      </li>
                    )}
                    {t.people && (
                      <li className="flex items-center gap-1">
                        <Users className="size-3" aria-hidden="true" /> {t.people} kishi
                      </li>
                    )}
                  </ul>
                </article>
              ))}
              {m.negotiationId && (
                <div className="flex flex-wrap items-center gap-3 text-left" role="status">
                  <span className="flex items-center gap-2 text-sm font-medium text-green-800">
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Agentlar ishga tushdi…
                  </span>
                  <Button variant="outline" className="h-11 px-4" disabled={starting} onClick={() => start(m.negotiationId!)}>
                    <Play className="size-4" aria-hidden="true" /> Hoziroq ochish
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {msgs.length === 1 && !busy && (
          <ul className="grid gap-3 pt-2 sm:grid-cols-3" aria-label="Tayyor so'rovlar">
            {STARTERS.map(({ icon: Icon, title, text: starter }) => (
              <li key={title}>
                <button type="button" onClick={() => setText(starter)} className="lift press flex min-h-28 w-full flex-col items-start gap-2 rounded-2xl border border-tint-3 bg-gradient-to-br from-tint-1 to-white p-4 text-left shadow-soft focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary text-white"><Icon className="size-4" aria-hidden="true" /></span>
                  <span className="text-sm font-bold">{title}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{starter}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Agent reja tuzmoqda...
          </p>
        )}
        <div ref={endRef} />
      </div>

      {upgrade && <UpgradeCard message={upgrade} className="mb-2" />}
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className={cn("mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1 pt-2", msgs.length === 1 && "hidden sm:hidden")}>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setText(ex)} className="min-h-11 shrink-0 rounded-full border border-tint-3 bg-card px-4 text-sm font-medium text-green-900 shadow-sm transition-colors hover:bg-tint-1 focus-visible:outline-2 focus-visible:outline-ring">
            {ex}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex shrink-0 items-end gap-2"
      >
        <label htmlFor="ask" className="sr-only">
          Yordamchiga xabar
        </label>
        <Textarea
          id="ask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={2}
          placeholder="Ertaga 6 kishilik osh joy band qil"
          className="min-h-12 flex-1 text-base sm:text-sm"
        />
        <Button type="submit" className="size-12" disabled={busy || !text.trim()} aria-label="Yuborish">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
