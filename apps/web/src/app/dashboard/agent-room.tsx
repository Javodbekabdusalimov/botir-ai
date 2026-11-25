"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Inbox, MessageCircle, Plus, Settings2, Sparkles, Wand2 } from "lucide-react";
import { IsoScene, SEATS, BOTIR_POS, toPct, type Seat } from "@/components/agent-room/iso-scene";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { useAuth } from "@/hooks/use-auth";
import { decideProposal, getChats, getKnowledge, getMessages, getOrders, getProposals } from "@/lib/api";
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
  const kb = useAsync(`kb:${id}`, () => getKnowledge(id));
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
  const waitingCount = list.filter((c) => c.needsHuman).length + (props.data ?? []).filter((p) => p.status === "pending" && p.id !== done).length;

  const seated = list.slice(0, SEATS.length);
  const seats: Seat[] = seated.map((c) => ({
    key: c.id,
    x: 0,
    y: 0,
    seed: (hash(c.id) % 11) + 1,
    active: c.id === current?.id,
    laptopGlow: c.mode === "autopilot",
  }));

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
  const aiTurns = kb.data?.metrics?.aiTurns;
  const status = need.kind !== "none" ? "Sizning qaroringizni kutmoqda" : current ? `${current.title.split(" ")[0]} bilan suhbatda` : "Mijozlarni kutmoqda";

  const flow = [
    { icon: MessageCircle, k: "Mijoz yozadi", v: chats.data ? `${list.length} ta suhbat` : "…" },
    { icon: Bot, k: "Botir javob beradi", v: kb.data ? (aiTurns ? `${aiTurns} ta javob` : "Hali javob yo'q") : "…" },
    { icon: Check, k: "Siz tasdiqlaysiz", v: chats.data ? (waitingCount ? `${waitingCount} ta qaror kutmoqda` : "Hammasi hal qilingan") : "…", warn: waitingCount > 0 },
  ];

  return (
    <div className="grid gap-4 rounded-[1.75rem] border border-white/60 bg-white/30 p-3 shadow-[var(--elev-soft)] backdrop-blur-xl sm:p-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[16.5rem_minmax(0,1fr)_21rem]">
      {/* ---------- Chap: suhbatlar ---------- */}
      <aside className="order-3 flex min-w-0 flex-col gap-2.5 lg:order-1">
        <div className="flex items-center justify-between px-1 pt-1">
          <h2 className="font-sans text-base font-semibold tracking-tight">Suhbatlar</h2>
          <span className="tabular rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">{list.length}</span>
        </div>

        <ul className="flex flex-col gap-1.5 lg:max-h-[29rem] lg:overflow-y-auto lg:pr-1">
          {chats.loading && Array.from({ length: 4 }, (_, i) => <li key={i} className="shimmer h-[3.75rem] rounded-2xl" />)}
          {!chats.loading && list.length === 0 && (
            <li className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Hali suhbat yo&apos;q.{" "}
              <Link href="/connect/telegram" className="font-semibold text-green-800 underline-offset-2 hover:underline">
                Telegram&apos;ni ulang
              </Link>
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
                    "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors",
                    active ? "border-white/80 bg-white/75 shadow-[var(--elev-soft)]" : "border-transparent bg-white/35 hover:bg-white/55",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80 text-xl" aria-hidden="true">{EMOJI[hash(c.id) % EMOJI.length]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{MODE[c.mode]} · {formatWhen(c.lastMessageAt)}</span>
                  </span>
                  {c.needsHuman && <span className="size-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-white" aria-label="Javob kerak" />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto grid gap-1.5 pt-1">
          <Link href="/dashboard/chat" className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-green-900 text-sm font-semibold text-white transition-colors hover:bg-green-950">
            <Plus className="size-4" aria-hidden="true" /> Agentni sinash
          </Link>
          <Link href="/dashboard/inbox" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/50 text-sm font-semibold text-green-950 transition-colors hover:bg-white/80">
            <Inbox className="size-4" aria-hidden="true" /> Inbox&apos;ni ochish
          </Link>
        </div>
      </aside>

      {/* ---------- Markaz: AI ofis ---------- */}
      <section className="order-1 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/55 shadow-[var(--elev-soft)] lg:order-2" aria-label="AI ofis">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI ofis</p>
            <h2 className="truncate text-2xl text-green-950 sm:text-[1.75rem]">{bizName}</h2>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-semibold text-green-900">
            <span className="size-1.5 animate-pulse rounded-full bg-[#e0a24e] motion-reduce:animate-none" /> Jonli
            <span className="tabular font-medium text-muted-foreground">{clock}</span>
          </span>
        </header>

        <p className="px-4 pt-1 text-sm text-muted-foreground sm:px-5">
          Botir: <span className="font-semibold text-green-950">{status}</span> · {list.length} mijoz · {activeOrders.length} buyurtma
        </p>

        {/* Sizdan kerak: sahna USTIDA emas, alohida qatorda */}
        {need.kind !== "none" && (
          <div className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 sm:mx-5 sm:flex-row sm:items-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800" aria-hidden="true">
              <AlertCircle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-900">{need.kind === "proposal" ? "Yaxshilash taklifi · tasdiqlang" : `${need.c.title} · AI javob bera olmadi`}</p>
              <p className="line-clamp-2 text-sm text-green-950">{need.kind === "proposal" ? need.p.reason || need.p.title : `“${need.c.lastMessageText ?? "Savol"}”`}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {need.kind === "proposal" ? (
                <>
                  <button type="button" disabled={!!busy} onClick={() => decide("reject")} className="h-9 rounded-xl px-3 text-sm font-semibold text-green-900 hover:bg-white/70 disabled:opacity-50">
                    {busy === "reject" ? "…" : "Rad etish"}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => decide("approve")} className="h-9 rounded-xl bg-green-900 px-3.5 text-sm font-semibold text-white hover:bg-green-950 disabled:opacity-50">
                    {busy === "approve" ? "…" : "Tasdiqlash"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setSel(need.c.id); setTab("thread"); }} className="h-9 rounded-xl px-3 text-sm font-semibold text-green-900 hover:bg-white/70">
                    Ko&apos;rish
                  </button>
                  <Link href={`/dashboard/inbox?chat=${need.c.id}`} className="grid h-9 place-items-center rounded-xl bg-green-900 px-3.5 text-sm font-semibold text-white hover:bg-green-950">
                    Javob berish
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        <div className="relative px-2 pt-8 sm:px-6">
          <IsoScene seats={seats} botirActive={need.kind === "proposal" || !current}>
            <Tag pos={toPct(BOTIR_POS[0], BOTIR_POS[1], 2.75)} label="Botir" tone="green" />
            {seated.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSel(c.id)}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={toPct(SEATS[i].person[0], SEATS[i].person[1], 2.75)}
                aria-label={`${c.title} suhbatini ochish`}
              >
                <Tag label={c.title.split(" ")[0]} tone={c.needsHuman ? "red" : c.id === current?.id ? "green" : "plain"} inline />
              </button>
            ))}
          </IsoScene>
        </div>

        {/* Oqim: maqsad bir qarashda */}
        <ol className="mt-auto grid border-t border-white/70 bg-white/40 sm:grid-cols-3">
          {flow.map((f, i) => {
            const Icon = f.icon;
            return (
              <li key={f.k} className={cn("flex min-w-0 items-center gap-2.5 px-3 py-3 sm:px-4", i > 0 && "border-t border-white/70 sm:border-l sm:border-t-0")}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", f.warn ? "bg-amber-100 text-amber-800" : "bg-white/80 text-green-900")}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-green-950">{f.k}</span>
                  <span className="block truncate text-xs text-muted-foreground">{f.v}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------- O'ng: inspektor ---------- */}
      <aside className="order-2 flex min-w-0 flex-col gap-3 lg:order-3">
        <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/50 p-1" role="tablist">
          {([
            ["inspector", "Agent"],
            ["thread", "Suhbat"],
            ["orders", "Buyurtmalar"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("h-8 flex-1 rounded-full text-xs font-semibold transition-colors", tab === k ? "bg-green-900 text-white" : "text-muted-foreground hover:text-green-950")}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "inspector" && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-3">
              <span className="grid size-10 place-items-center rounded-xl bg-green-900 text-white" aria-hidden="true">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Botir <span className="font-normal text-muted-foreground">· biznes agenti</span></p>
                <p className="truncate text-xs text-muted-foreground">{status}</p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider", need.kind === "none" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>
                {need.kind === "none" ? "ISHLAYAPTI" : "KUTMOQDA"}
              </span>
            </div>

            <section className="flex-1 rounded-2xl border border-white/70 bg-white/60 p-3">
              <h3 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">So&apos;nggi harakatlar{current ? ` · ${current.title.split(" ")[0]}` : ""}</h3>
              <Timeline msgs={msgs.data} loading={msgs.loading} chat={current} />
            </section>

            <div className="grid grid-cols-2 gap-1.5">
              <Link href="/connect" className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/50 text-xs font-semibold text-green-950 hover:bg-white/80">
                <Settings2 className="size-3.5" aria-hidden="true" /> Sozlash
              </Link>
              <Link href="/dashboard/improve" className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/50 text-xs font-semibold text-green-950 hover:bg-white/80">
                <Wand2 className="size-3.5" aria-hidden="true" /> Yaxshilash
              </Link>
            </div>
          </>
        )}

        {tab === "orders" && <OrdersList orders={orders.data} loading={orders.loading} />}
        {tab === "thread" && <Thread msgs={msgs.data} loading={msgs.loading} chat={current} />}
      </aside>
    </div>
  );
}

function Tag({ label, tone, pos, inline }: { label: string; tone: "green" | "red" | "plain"; pos?: { left: string; top: string }; inline?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 text-[10px] font-semibold shadow-sm",
        !inline && "absolute -translate-x-1/2 -translate-y-full",
        tone === "green" ? "border-green-300 text-green-900" : tone === "red" ? "border-red-200 text-red-700" : "border-border text-green-900/70",
      )}
      style={pos}
    >
      <span className={cn("size-1.5 rounded-full", tone === "red" ? "bg-red-500" : tone === "green" ? "bg-[#e0a24e]" : "bg-green-300")} />
      {label}
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
  if (!chat) return <p className="text-sm text-muted-foreground">Suhbat tanlang.</p>;
  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-10 rounded-xl" />)}</div>;
  const last = (msgs ?? []).slice(-5);
  const name = chat.title.split(" ")[0];
  const waiting = chat.needsHuman || last.at(-1)?.isDraft;
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-6 before:left-[11px] before:top-2 before:w-px before:bg-green-200">
      {last.map((m) => {
        const s = stepOf(m, name);
        return (
          <li key={m.id} className="relative flex gap-3">
            <span className={cn("z-10 grid size-6 shrink-0 place-items-center rounded-full", s.tone === "in" ? "bg-green-800 text-white" : s.tone === "wait" ? "bg-amber-500 text-white" : "bg-green-900 text-white")}>
              {s.tone === "in" ? <MessageCircle className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-green-800">✦ {s.who}</span> · {formatWhen(m.sentAt)}
              </p>
              <p className="text-[13px] font-semibold text-green-950">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">{m.transcript ?? m.text}</p>
            </div>
          </li>
        );
      })}
      <li className="relative flex gap-3">
        <span className={cn("z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 bg-white", waiting ? "border-amber-400" : "border-green-500")}>
          <span className={cn("size-2 rounded-full", waiting ? "bg-amber-400" : "animate-pulse bg-[#e0a24e] motion-reduce:animate-none")} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-green-950">{waiting ? "Sizning qaroringiz kutilmoqda" : "Keyingi xabarni kutmoqda"}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/80">
            <div className={cn("h-full rounded-full", waiting ? "w-2/3 bg-amber-400" : "w-1/3 bg-[#e0a24e]")} />
          </div>
        </div>
      </li>
    </ol>
  );
}

const ST: Record<Order["status"], { l: string; c: string }> = {
  draft: { l: "Qoralama", c: "bg-white/80 text-green-900" },
  pending_confirm: { l: "Tasdiq kutilmoqda", c: "bg-amber-50 text-amber-700" },
  confirmed: { l: "Tasdiqlangan", c: "bg-green-50 text-green-800" },
  paid: { l: "To'langan", c: "bg-green-800 text-white" },
  cancelled: { l: "Bekor", c: "bg-red-50 text-red-600" },
};

function OrdersList({ orders, loading }: { orders?: Order[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/60 p-3">
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
      ) : !orders?.length ? (
        <p className="p-3 text-center text-sm text-muted-foreground">Hali buyurtma yo&apos;q.</p>
      ) : (
        <ul className="divide-y divide-white/70">
          {orders.slice(0, 8).map((o) => (
            <li key={o.id} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                <p className="text-xs text-muted-foreground">{formatWhen(o.createdAt)}{o.discountPct ? ` · −${o.discountPct}%` : ""}</p>
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
    <section className="flex flex-col rounded-2xl border border-white/70 bg-white/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Inbox className="size-4 text-green-800" aria-hidden="true" /> {chat.title}
      </p>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="shimmer h-10 rounded-xl" />)}</div>
      ) : (
        <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
          {(msgs ?? []).slice(-12).map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug", m.direction === "in" ? "self-start bg-white/80 text-green-950" : "self-end bg-green-800 text-white", m.isDraft && "border border-dashed border-amber-400 bg-amber-50 text-amber-900")}>
              {m.author === "ai" && <Sparkles className="mr-1 inline size-3 opacity-80" aria-hidden="true" />}
              {m.transcript ?? m.text}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/dashboard/inbox?chat=${chat.id}`} className="mt-3 grid h-9 place-items-center rounded-xl bg-green-900 text-xs font-semibold text-white hover:bg-green-950">
        Inbox&apos;da ochish
      </Link>
    </section>
  );
}
