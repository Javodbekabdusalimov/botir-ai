"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronRight, Inbox, MessageCircle, Paperclip, Plus, Send, Settings2, Sparkles, Wand2 } from "lucide-react";
import { IsoScene, SEATS, BOTIR_POS, toPct, type Seat } from "@/components/agent-room/iso-scene";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { useAuth } from "@/hooks/use-auth";
import { decideProposal, getChats, getMessages, getOrders, getProposals } from "@/lib/api";
import { formatSom, formatWhen } from "@/lib/format";
import type { Chat, ChatMode, InboxMessage, LoopProposal, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const MODE: Record<ChatMode, string> = { autopilot: "Avtopilot", copilot: "Copilot", command: "Buyruq", off: "O'chiq" };
const EMOJI = ["🍲", "🚚", "🛍️", "📦", "🧾", "☕", "🎂", "🔧"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function useClock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false }));
    f();
    const i = setInterval(f, 30_000);
    return () => clearInterval(i);
  }, []);
  return t;
}

type Need =
  | { kind: "proposal"; p: LoopProposal }
  | { kind: "chat"; c: Chat }
  | { kind: "none" };

export function AgentRoom() {
  const id = useBusinessId();
  const { business } = useAuth();
  const chats = useAsync(`chats:${id}`, () => getChats(id));
  const orders = useAsync(`orders:${id}`, () => getOrders(id));
  const props = useAsync(`proposals:${id}`, () => getProposals(id));
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"inspector" | "orders" | "thread">("inspector");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const clock = useClock();

  const list = useMemo(
    () => [...(chats.data ?? [])].sort((a, b) => Number(b.needsHuman) - Number(a.needsHuman) || b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [chats.data],
  );
  const current = list.find((c) => c.id === sel) ?? list[0] ?? null;
  const msgs = useAsync(`msgs:${current?.id ?? "-"}`, () => (current ? getMessages(current.id) : Promise.resolve([] as InboxMessage[])));

  const pendingProposal = (props.data ?? []).find((p) => p.status === "pending" && p.id !== done);
  const humanChat = list.find((c) => c.needsHuman);
  const need: Need = pendingProposal ? { kind: "proposal", p: pendingProposal } : humanChat ? { kind: "chat", c: humanChat } : { kind: "none" };

  const seated = list.slice(0, SEATS.length);
  const seats: Seat[] = seated.map((c) => ({
    key: c.id,
    x: 0,
    y: 0,
    seed: (hash(c.id) % 11) + 1,
    active: c.id === current?.id,
    laptopGlow: c.mode === "autopilot",
  }));
  const needSeat = need.kind === "chat" ? seated.findIndex((c) => c.id === need.c.id) : -1;
  const bubbleAt = needSeat >= 0 ? SEATS[needSeat].person : BOTIR_POS;

  async function decide(d: "approve" | "reject") {
    if (need.kind !== "proposal") return;
    setBusy(d);
    try {
      await decideProposal(need.p.id, d);
      setDone(need.p.id);
      props.reload();
    } finally {
      setBusy(null);
    }
  }

  const bizName = business?.name ?? "Mening biznesim";
  const activeOrders = (orders.data ?? []).filter((o) => o.status !== "cancelled");

  return (
    <div className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-3 sm:p-4 lg:grid-cols-[15.5rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
      {/* ---------- Chap: suhbat xonalari ---------- */}
      <aside className="order-3 flex min-w-0 flex-col gap-3 lg:order-1">
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="grid size-8 place-items-center rounded-xl bg-white shadow-[var(--elev-soft)]">
            <MessageCircle className="size-4 text-green-700" aria-hidden="true" />
          </span>
          <h2 className="font-sans text-lg font-bold tracking-tight">Suhbat xonalari</h2>
        </div>

        <Link href="/dashboard/inbox" className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)] transition-shadow hover:shadow-[var(--elev-lift)]">
          <span className="grid size-10 place-items-center rounded-xl bg-green-50 text-xl" aria-hidden="true">📥</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Inbox</span>
            <span className="block truncate text-xs text-slate-500">{list.length} ta suhbat · {list.filter((c) => c.needsHuman).length} tasi sizni kutmoqda</span>
          </span>
          <ChevronRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link href="/dashboard/improve" className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)] transition-shadow hover:shadow-[var(--elev-lift)]">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-xl" aria-hidden="true">🧪</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Yaxshilash xonasi</span>
            <span className="block truncate text-xs text-slate-500">{(props.data ?? []).filter((p) => p.status === "pending").length} ta taklif kutmoqda</span>
          </span>
          <ChevronRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <div className="flex items-center justify-between px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Mijozlar</span>
          <span className="tabular">{Math.min(list.length, 99)}</span>
        </div>
        <Link href="/dashboard/chat" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <Plus className="size-4" aria-hidden="true" /> Agentni sinash
        </Link>

        <ul className="flex flex-col gap-2 lg:max-h-[30rem] lg:overflow-y-auto lg:pr-1">
          {chats.loading && Array.from({ length: 4 }, (_, i) => <li key={i} className="shimmer h-[3.75rem] rounded-2xl" />)}
          {!chats.loading && list.length === 0 && (
            <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              Hali suhbat yo&apos;q. <Link href="/connect/telegram" className="font-semibold text-green-700">Telegram&apos;ni ulang</Link>
            </li>
          )}
          {list.map((c) => {
            const active = c.id === current?.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSel(c.id);
                    setTab("inspector");
                  }}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition-all",
                    active ? "border-green-300 shadow-[0_0_0_3px_rgb(220_252_231)]" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  {c.needsHuman && <span className="absolute -left-1 -top-1 size-3 rounded-full border-2 border-white bg-red-500" aria-label="Javob kerak" />}
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-xl" aria-hidden="true">{EMOJI[hash(c.id) % EMOJI.length]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.title}</span>
                    <span className="block truncate text-xs text-slate-500">{MODE[c.mode]} · {formatWhen(c.lastMessageAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ---------- Markaz: xona sahnasi ---------- */}
      <section className="order-1 flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-[var(--elev-soft)] lg:order-2" aria-label="Agent xonasi">
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate font-sans text-xl font-bold tracking-tight">{bizName}</h2>
            <p className="text-xs text-slate-500">
              1 biznes agenti · {list.length} mijoz · {activeOrders.length} buyurtma
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            <span className="size-1.5 animate-pulse rounded-full bg-green-500 motion-reduce:animate-none" /> jonli
            <span className="tabular text-slate-400">{clock}</span>
          </span>
        </header>

        <div className="relative px-2 pt-14 sm:px-6">
          <IsoScene seats={seats} botirActive={need.kind === "proposal" || !current}>
            {/* Nom yorliqlari */}
            <Tag pos={toPct(BOTIR_POS[0], BOTIR_POS[1], 2.75)} label="Botir" sub="biznes agenti" tone="green" />
            {seated.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSel(c.id)}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={toPct(SEATS[i].person[0], SEATS[i].person[1], 2.75)}
                aria-label={`${c.title} suhbatini ochish`}
              >
                <Tag label={c.title.split(" ")[0]} sub={c.needsHuman ? "javob kerak" : MODE[c.mode].toLowerCase()} tone={c.needsHuman ? "red" : c.id === current?.id ? "green" : "plain"} inline />
              </button>
            ))}

            {/* "Sizdan kerak" pufakchasi */}
            {need.kind !== "none" && (
              <div className="absolute z-10 hidden w-[min(15rem,62%)] -translate-x-1/2 -translate-y-full sm:block" style={toPct(bubbleAt[0], bubbleAt[1], 3.8)}>
                <div className="float-y rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.25)]">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="rounded-md bg-slate-900 px-1.5 py-0.5 tracking-wider text-white">SIZDAN KERAK</span>
                    <span className="text-slate-500">· {need.kind === "proposal" ? "Botir" : need.c.title.split(" ")[0]}</span>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-snug text-slate-700">
                    {need.kind === "proposal" ? need.p.title : `${need.c.title}: "${need.c.lastMessageText ?? "savol"}" — AI javob bera olmadi.`}
                  </p>
                  <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5">
                    {need.kind === "proposal" ? (
                      <>
                        <button type="button" disabled={!!busy} onClick={() => decide("reject")} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                          {busy === "reject" ? "..." : "Rad etish"}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => decide("approve")} className="h-8 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                          {busy === "approve" ? "..." : "Tasdiqlash"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setSel(need.c.id); setTab("thread"); }} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                          Ko&apos;rib chiqish
                        </button>
                        <Link href={`/dashboard/inbox?chat=${need.c.id}`} className="grid h-8 place-items-center rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700">
                          Javob berish
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <span className="mx-auto -mt-[7px] block size-3.5 rotate-45 border-b border-r border-slate-200 bg-white" aria-hidden="true" />
              </div>
            )}
          </IsoScene>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-2 sm:px-5">
          <Link href="/dashboard/inbox" className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="size-4" aria-hidden="true" /> Inbox
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/connect" className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Settings2 className="size-4" aria-hidden="true" /> Agentni sozlash
            </Link>
            <Link href="/dashboard/improve" className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Agentni yaxshilash">
              <Wand2 className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <Link href="/dashboard/chat" className="mx-4 mb-4 mt-2 flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-2 text-sm text-slate-400 transition-colors hover:border-green-300 sm:mx-5">
          <span className="flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
            <Bot className="size-3.5" aria-hidden="true" /> @Botir
          </span>
          <span className="min-w-0 flex-1 truncate">Mijoz sifatida yozing — agent haqiqiy javob beradi</span>
          <Paperclip className="size-4" aria-hidden="true" />
          <Send className="mr-1 size-4 text-green-600" aria-hidden="true" />
        </Link>
      </section>

      {/* ---------- O'ng: inspektor ---------- */}
      <aside className="order-2 flex min-w-0 flex-col gap-3 lg:order-3">
        <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-[var(--elev-soft)]" role="tablist">
          {([
            ["inspector", "Inspektor"],
            ["orders", "Buyurtmalar"],
            ["thread", "Suhbat"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("h-8 flex-1 rounded-full text-xs font-semibold transition-colors", tab === k ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900")}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "inspector" && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)]">
              <span className="grid size-9 place-items-center rounded-xl bg-green-50 text-lg" aria-hidden="true">🤖</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Botir <span className="font-normal text-slate-400">· biznes agenti</span></p>
                <p className="truncate text-xs text-slate-500">{current ? `${current.title} bilan suhbatda` : "Mijoz kutmoqda"}</p>
              </div>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider", need.kind === "none" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
                {need.kind === "none" ? "TAYYOR" : "KUTMOQDA"}
              </span>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)]">
              <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sizdan kerak</h3>
              {need.kind === "none" ? (
                <p className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800">
                  <Check className="size-4" aria-hidden="true" /> Hozircha hech narsa — agent o&apos;zi ishlayapti.
                </p>
              ) : (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-1 text-[10px] font-bold text-slate-500">
                    <span className="mr-1 rounded bg-slate-900 px-1.5 py-0.5 text-white">SIZDAN KERAK</span>
                    {need.kind === "proposal" ? "Yaxshilash taklifi" : "Javobsiz savol"}
                  </p>
                  <p className="text-[13px] leading-snug text-slate-700">{need.kind === "proposal" ? need.p.reason || need.p.title : need.c.lastMessageText}</p>
                  {need.kind === "proposal" && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Sifat bali: <b className="tabular text-slate-700">{need.p.evalBefore}</b> → <b className="tabular text-green-700">{need.p.evalAfter}</b>
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-1.5">
                    {need.kind === "proposal" ? (
                      <>
                        <Link href="/dashboard/improve" className="grid h-8 place-items-center rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Batafsil</Link>
                        <button type="button" disabled={!!busy} onClick={() => decide("approve")} className="h-8 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Tasdiqlash</button>
                      </>
                    ) : (
                      <Link href={`/dashboard/inbox?chat=${need.c.id}`} className="grid h-8 place-items-center rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700">Javob berish</Link>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="flex-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)]">
              <h3 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agent hozir nima qilyapti</h3>
              <Timeline msgs={msgs.data} loading={msgs.loading} chat={current} />
            </section>
          </>
        )}

        {tab === "orders" && <OrdersList orders={orders.data} loading={orders.loading} />}
        {tab === "thread" && <Thread msgs={msgs.data} loading={msgs.loading} chat={current} />}
      </aside>
    </div>
  );
}

function Tag({ label, sub, tone, pos, inline }: { label: string; sub: string; tone: "green" | "red" | "plain"; pos?: { left: string; top: string }; inline?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 text-[10px] font-semibold shadow-sm",
        !inline && "absolute -translate-x-1/2 -translate-y-full",
        tone === "green" ? "border-green-300 text-green-800" : tone === "red" ? "border-red-200 text-red-700" : "border-slate-200 text-slate-600",
      )}
      style={pos}
    >
      <span className={cn("size-1.5 rounded-full", tone === "red" ? "bg-red-500" : tone === "green" ? "bg-green-500" : "bg-slate-300")} />
      {label} <span className="font-medium opacity-60">{sub}</span>
    </span>
  );
}

function stepOf(m: InboxMessage, name: string) {
  if (m.isDraft) return { who: "Botir", title: "Javob qoralamasi tayyor", tone: "wait" as const };
  if (m.author === "ai") return { who: "Botir", title: "Mijozga javob berdi", tone: "done" as const };
  if (m.author === "owner") return { who: "Siz", title: "Siz yozdingiz", tone: "done" as const };
  return { who: name, title: m.voiceUrl ? "Ovozli xabar yubordi" : "Xabar yozdi", tone: "in" as const };
}

function Timeline({ msgs, loading, chat }: { msgs?: InboxMessage[]; loading: boolean; chat: Chat | null }) {
  if (!chat) return <p className="text-sm text-slate-500">Suhbat tanlang.</p>;
  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-10 rounded-xl" />)}</div>;
  const last = (msgs ?? []).slice(-5);
  const name = chat.title.split(" ")[0];
  const waiting = chat.needsHuman || last.at(-1)?.isDraft;
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-6 before:left-[11px] before:top-2 before:w-px before:bg-slate-200">
      {last.map((m) => {
        const s = stepOf(m, name);
        return (
          <li key={m.id} className="relative flex gap-3">
            <span className={cn("z-10 grid size-6 shrink-0 place-items-center rounded-full", s.tone === "in" ? "bg-green-600 text-white" : s.tone === "wait" ? "bg-amber-400 text-white" : "bg-slate-900 text-white")}>
              {s.tone === "in" ? <MessageCircle className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400">
                <span className="font-semibold text-green-700">✦ {s.who}</span> · {formatWhen(m.sentAt)}
              </p>
              <p className="text-[13px] font-semibold text-slate-800">{s.title}</p>
              <p className="truncate text-xs text-slate-500">{m.transcript ?? m.text}</p>
            </div>
          </li>
        );
      })}
      <li className="relative flex gap-3">
        <span className={cn("z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 bg-white", waiting ? "border-amber-400" : "border-green-500")}>
          <span className={cn("size-2 rounded-full", waiting ? "bg-amber-400" : "animate-pulse bg-green-500 motion-reduce:animate-none")} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800">{waiting ? "Sizning qaroringiz kutilmoqda" : "Keyingi xabarni kutmoqda"}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full", waiting ? "w-2/3 bg-amber-400" : "w-1/3 bg-green-500")} />
          </div>
        </div>
      </li>
    </ol>
  );
}

const ST: Record<Order["status"], { l: string; c: string }> = {
  draft: { l: "Qoralama", c: "bg-slate-100 text-slate-600" },
  pending_confirm: { l: "Tasdiq kutilmoqda", c: "bg-amber-50 text-amber-700" },
  confirmed: { l: "Tasdiqlangan", c: "bg-green-50 text-green-700" },
  paid: { l: "To'langan", c: "bg-green-600 text-white" },
  cancelled: { l: "Bekor", c: "bg-red-50 text-red-600" },
};

function OrdersList({ orders, loading }: { orders?: Order[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)]">
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
      ) : !orders?.length ? (
        <p className="p-3 text-center text-sm text-slate-500">Hali buyurtma yo&apos;q.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {orders.slice(0, 8).map((o) => (
            <li key={o.id} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                <p className="text-xs text-slate-500">{formatWhen(o.createdAt)}{o.discountPct ? ` · −${o.discountPct}%` : ""}</p>
              </div>
              <div className="text-right">
                <p className="tabular text-[13px] font-bold text-green-800">{formatSom(o.total)}</p>
                <span className={cn("mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold", ST[o.status].c)}>{ST[o.status].l}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Thread({ msgs, loading, chat }: { msgs?: InboxMessage[]; loading: boolean; chat: Chat | null }) {
  if (!chat) return null;
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--elev-soft)]">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Inbox className="size-4 text-green-700" aria-hidden="true" /> {chat.title}
      </p>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="shimmer h-10 rounded-xl" />)}</div>
      ) : (
        <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
          {(msgs ?? []).slice(-12).map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug", m.direction === "in" ? "self-start bg-slate-100 text-slate-800" : "self-end bg-green-600 text-white", m.isDraft && "border border-dashed border-amber-400 bg-amber-50 text-amber-900")}>
              {m.author === "ai" && <Sparkles className="mr-1 inline size-3 opacity-80" aria-hidden="true" />}
              {m.transcript ?? m.text}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/dashboard/inbox?chat=${chat.id}`} className="mt-3 grid h-9 place-items-center rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800">
        Inbox&apos;da ochish
      </Link>
    </section>
  );
}
