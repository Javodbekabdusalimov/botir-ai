"use client";

import Link from "next/link";
import { Check, Inbox, MessageCircle, Sparkles } from "lucide-react";
import { formatSom, formatWhen } from "@/lib/format";
import type { Chat, InboxMessage, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Tag({ label, tone, pos, inline }: { label: string; tone: "green" | "red" | "plain"; pos?: { left: string; top: string }; inline?: boolean }) {
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
  if (m.isDraft) return { who: "Agent", title: "Javob qoralamasi tayyor", tone: "wait" as const };
  if (m.author === "ai") return { who: "Agent", title: "Mijozga javob berdi", tone: "done" as const };
  if (m.author === "owner") return { who: "Siz", title: "Siz yozdingiz", tone: "done" as const };
  return { who: name, title: m.voiceUrl ? "Ovozli xabar yubordi" : "Xabar yozdi", tone: "in" as const };
}

export function Timeline({ msgs, loading, chat }: { msgs?: InboxMessage[]; loading: boolean; chat: Chat | null }) {
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

export function OrdersList({ orders, loading }: { orders?: Order[]; loading: boolean }) {
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

export function Thread({ msgs, loading, chat }: { msgs?: InboxMessage[]; loading: boolean; chat: Chat | null }) {
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
