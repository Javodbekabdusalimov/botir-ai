"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCheck, Loader2, Mic, Send, Sparkles } from "lucide-react";
import { OfferCard } from "@/components/negotiation";
import { BizAvatar } from "@/components/biz-avatar";
import { useNegotiation } from "@/hooks/use-negotiation";
import { useAsync } from "@/hooks/use-async";
import { agentRequest, confirmNegotiation, getBusinesses } from "@/lib/api";
import type { ConfirmResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const time = (iso?: string) => hhmm(iso ? new Date(iso) : new Date());

interface Turn {
  id: number;
  from: "me" | "ai";
  text: string;
  at: string;
  negotiationId?: string;
}

export function AgentAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-green-400 to-green-700 text-white shadow-sm" style={{ width: size, height: size }}>
      <Bot style={{ width: size * 0.55, height: size * 0.55 }} aria-hidden="true" />
    </span>
  );
}

function Typing({ biz, id }: { biz: boolean; id?: string }) {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="Yozmoqda">
      {biz ? <BizAvatar id={id ?? ""} name="" size={28} /> : <AgentAvatar size={28} />}
      <div className="flex h-9 items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("typing-dot size-1.5 rounded-full", biz ? "bg-biz" : "bg-agent")} />
        ))}
      </div>
    </div>
  );
}

/** Bitta so'rovga tegishli jonli muzokara: biznes agenti bilan yozishmalar pufakchalar ko'rinishida, taklif kartasi ichida. */
function NegotiationTurn({ id, names, onDone }: { id: string; names: Record<string, string>; onDone: () => void }) {
  const state = useNegotiation(id);
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ranked = useMemo(() => Object.values(state.best).sort((a, b) => a.offer.price - b.offer.price), [state.best]);
  const ready = state.status === "agreed" || state.status === "confirmed";
  const msgCount = state.order.reduce((s, b) => s + state.lanes[b].messages.length, 0);
  const typing = state.order.map((b) => ({ b, t: state.lanes[b].typing })).filter((x) => x.t);
  useEffect(() => {
    onDone();
  }, [msgCount, typing.length, ranked.length, result, onDone]);

  const current = ranked.length ? ranked[skip % ranked.length] : null;
  async function confirm() {
    if (!current || confirming) return;
    setConfirming(true);
    setErr(null);
    try {
      setResult(await confirmNegotiation(id, current.businessId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tasdiqlab bo'lmadi");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-3">
      {state.order.length === 0 && !state.error && <Typing biz={false} />}
      {state.order.map((bid) => (
        <div key={bid} className="space-y-2">
          <p className="flex items-center gap-1.5 pl-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <BizAvatar id={bid} name="" size={16} /> {names[bid] ?? state.best[bid]?.businessName ?? "Biznes"} agenti bilan
          </p>
          {state.lanes[bid].messages.map((m) => {
            const biz = m.fromAgent === "business";
            return (
              <div key={m.id} className={cn("rise-in flex items-end gap-2", !biz && "flex-row-reverse")}>
                {biz ? <BizAvatar id={bid} name="" size={28} /> : <AgentAvatar size={28} />}
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm",
                    biz ? "rounded-bl-md border border-amber-200 bg-biz-soft" : "rounded-br-md bg-green-600 text-white",
                  )}
                >
                  {m.text.slice(0, m.shown)}
                  <span className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", biz ? "text-muted-foreground" : "text-green-100")}>
                    {time(m.createdAt)}
                    {!biz && <CheckCheck className="size-3" aria-hidden="true" />}
                  </span>
                </div>
              </div>
            );
          })}
          {state.lanes[bid].typing && <Typing biz={state.lanes[bid].typing === "business"} id={bid} />}
        </div>
      ))}
      {state.error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {(state.status === "rejected" || state.status === "failed") && <p className="text-sm text-muted-foreground">Agentlar kelisha olmadi. So&apos;rovni o&apos;zgartirib ko&apos;ring.</p>}
      {current && (
        <div className="pl-0 sm:pl-9">
          <OfferCard
            key={ready ? "final" : "live"}
            best={current}
            ready={ready}
            confirming={confirming}
            result={result}
            error={err}
            onConfirm={confirm}
            onOther={() => setSkip((s) => s + 1)}
            othersLeft={ranked.length > 1}
          />
        </div>
      )}
    </div>
  );
}

const CHIPS = ["Ertaga 18:00 ga 6 kishilik osh joy band qil", "Chilonzorda moy almashtirish", "Narxlarni solishtir", "Eng arzon taklifni top"];

/** "Botir AI bilan chat": /agent/request + SSE oqimi chat pufakchalari sifatida. */
export function BotirChat({ businessName, className, chips = CHIPS }: { businessName?: string; className?: string; chips?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const names = useAsync("businesses", getBusinesses);
  const nameMap = useMemo(() => Object.fromEntries((names.data ?? []).map((b) => [b.id, b.name])), [names.data]);
  const scroll = useCallback(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), []);
  useEffect(() => {
    scroll();
  }, [turns.length, busy, scroll]);

  async function send(raw: string) {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    setError(null);
    setTurns((m) => [...m, { id: m.length, from: "me", text: t, at: time() }]);
    setBusy(true);
    try {
      const q = businessName ? `${t} (${businessName})` : t;
      const { negotiationId } = await agentRequest(q);
      setTurns((m) => [
        ...m,
        { id: m.length, from: "ai", text: "Tushundim. Biznes agentlari bilan gaplashib, eng yaxshi narxni topaman. Siz faqat tasdiqlaysiz.", at: time(), negotiationId },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent javob bermadi, qayta urinib ko'ring");
      setText(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-gradient-to-b from-tint-1/70 to-background", className)}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        <div className="flex items-end gap-2">
          <AgentAvatar size={28} />
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2 text-[14px] shadow-sm">
            Salom! Men Botir AI{businessName ? `, ${businessName} agentiman` : " yordamchisiman"}. Nima kerak? Bizneslar bilan o&apos;zim gaplashaman, siz faqat tasdiqlaysiz.
          </div>
        </div>
        {turns.map((m) =>
          m.from === "me" ? (
            <div key={m.id} className="rise-in flex flex-row-reverse">
              <div className="max-w-[82%] rounded-2xl rounded-br-md bg-green-600 px-3.5 py-2 text-[14px] text-white shadow-sm">
                {m.text}
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-green-100">
                  {m.at} <CheckCheck className="size-3" aria-hidden="true" />
                </span>
              </div>
            </div>
          ) : (
            <div key={m.id} className="space-y-3">
              <div className="rise-in flex items-end gap-2">
                <AgentAvatar size={28} />
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2 text-[14px] shadow-sm">
                  {m.text}
                  <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">{m.at}</span>
                </div>
              </div>
              {m.negotiationId && <NegotiationTurn id={m.negotiationId} names={nameMap} onDone={scroll} />}
            </div>
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 pl-9 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Agent so&apos;rovni tahlil qilmoqda…
          </p>
        )}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="px-4 pb-1 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="shrink-0 border-t border-border bg-card/90 px-3 pb-3 pt-2 backdrop-blur sm:px-4">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Tezkor javoblar">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => void send(c)} disabled={busy} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tint-3 bg-tint-1 px-3 text-[13px] font-medium text-green-900 transition-colors hover:bg-tint-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">
              <Sparkles className="size-3" aria-hidden="true" /> {c}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="botir-chat-input" className="sr-only">
            Xabar
          </label>
          <input
            id="botir-chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Xabar yozing…"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm"
          />
          <button type="button" disabled title="Ovoz bilan yozish: tez orada" aria-label="Mikrofon: tez orada" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-muted text-muted-foreground opacity-70">
            <Mic className="size-4" aria-hidden="true" />
          </button>
          <button type="submit" disabled={busy || !text.trim()} aria-label="Yuborish" className="grid size-11 shrink-0 place-items-center rounded-full bg-green-600 text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">
            <Send className="size-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
