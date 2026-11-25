"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logos";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, Loader2, Mic, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ErrorBox, Loading } from "@/components/states";
import { CHAT_MODES } from "@/components/tg-mode";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { getChats, getMessages, sendMessage, setChatMode } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { Chat, ChatMode, InboxMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Chat holati: odam kerak (qizil) / kutyapti (o'qilmagan) / AI javob berdi */
function statusOf(c: Chat): { label: string; cls: string } {
  if (c.needsHuman) return { label: "Odam kerak 🔴", cls: "bg-red-50 text-red-700 ring-1 ring-red-200" };
  if (c.unread) return { label: "Kutyapti", cls: "bg-biz-soft text-biz ring-1 ring-amber-200" };
  return { label: "AI javob berdi", cls: "bg-tint-2 text-green-900" };
}

const modeOf = (m: ChatMode) => CHAT_MODES.find((x) => x.id === m)!;
const AV = ["bg-green-100 text-green-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800"];
const avOf = (t: string) => AV[[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const diff = Math.round((+new Date(new Date().toDateString()) - +new Date(d.toDateString())) / 86400000);
  return diff === 0 ? "Bugun" : diff === 1 ? "Kecha" : formatWhen(iso).split(",")[0];
};
const WAVE = [4, 9, 6, 14, 10, 18, 8, 12, 16, 7, 11, 5, 13, 9, 6, 10, 4];

export function InboxView() {
  const id = useBusinessId();
  const chats = useAsync(`chats:${id}`, () => getChats(id));
  // /dashboard (agent xonasi) dan `?chat=<id>` bilan kelinsa, o'sha suhbat ochiladi
  const [selected, setSelected] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("chat")));
  const [modes, setModes] = useState<Record<string, ChatMode>>({});
  const [filter, setFilter] = useState<"human" | "all">("all");
  const list = chats.data;
  const current = list?.find((c) => c.id === selected) ?? null;

  if (chats.loading) return <Loading />;
  if (chats.error || !list) return <ErrorBox message={chats.error ?? "Ma'lumot yo'q"} onRetry={chats.reload} />;
  if (!list.length)
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-tint-3 bg-gradient-to-b from-tint-1 to-card px-6 py-14 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-white shadow-soft"><BrandLogo brand="telegram" height={30} /></span>
        <h2 className="mt-4 font-sans text-lg font-extrabold">Hali yozishmalar yo&apos;q</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Telegram akkauntingizni ulang: mijoz xabarlari, AI qoralamalari va ovozli xabarlar shu yerda Telegram kabi ko&apos;rinadi.</p>
        <Link href="/connect/telegram" className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-green-600 px-5 text-sm font-bold text-white hover:bg-green-700">
          <Send className="size-4" aria-hidden="true" /> Telegramni ulash
        </Link>
      </div>
    );

  const urgent = list.filter((c) => c.needsHuman).length;
  // Egasi javobi kerak bo'lganlar tepada; qolgani oxirgi xabar bo'yicha
  const sorted = [...list].sort((a, b) => Number(b.needsHuman) - Number(a.needsHuman) || +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  const visible = filter === "human" ? sorted.filter((c) => c.needsHuman) : sorted;

  return (
    <div className="grid h-[calc(100dvh-14rem)] sm:h-[calc(100dvh-17rem)] min-h-[30rem] gap-4 md:grid-cols-[20rem_1fr]">
      <div className={cn("min-h-0 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-soft", current && "hidden md:block")}>
        {urgent > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="status">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> {urgent} ta chatda sizning javobingiz kerak
          </p>
        )}
        <div className="mb-2 grid grid-cols-2 rounded-xl bg-muted p-1" role="group" aria-label="Filtr">
          {(
            [
              ["human", `Odam kerak (${urgent})`],
              ["all", `Hammasi (${list.length})`],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("h-9 rounded-lg text-[13px] font-semibold transition-colors", filter === f ? "bg-card text-green-900 shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        {visible.length === 0 && <Empty>Odam javobi kerak bo&apos;lgan chat yo&apos;q. Agent hammasini o&apos;zi hal qilmoqda.</Empty>}
        <ul className="space-y-0.5" aria-label="Chatlar">
          {visible.map((c) => {
            const mode = modes[c.id] ?? c.mode;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  aria-current={c.id === selected ? "true" : undefined}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-tint-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", c.id === selected && "bg-tint-2/70")}
                >
                  <span className={cn("relative grid size-11 shrink-0 place-items-center rounded-full text-base font-bold", avOf(c.title))}>
                    {c.title.slice(0, 1).toUpperCase()}
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-white ring-1 ring-border"><BrandLogo brand="telegram" height={13} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-[15px]", c.unread ? "font-bold" : "font-semibold")}>{c.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{hm(c.lastMessageAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-muted-foreground">{c.lastMessageText}</span>
                      {!!c.unread && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-green-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", c.needsHuman ? "bg-red-500" : c.unread ? "bg-amber-400" : "bg-green-500")} aria-hidden="true" />
                      <span className="text-[11px] font-medium text-muted-foreground">{statusOf(c).label.replace(" 🔴", "")} · {modeOf(mode).label}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cn("min-h-0", !current && "hidden md:block")}>
        {current ? (
          <ChatDetail key={current.id} chat={current} mode={modes[current.id] ?? current.mode} onMode={(m) => setModes((s) => ({ ...s, [current.id]: m }))} onBack={() => setSelected(null)} />
        ) : (
          <Empty>Chatni tanlang: mijoz xabarlari va AI qoralamalari shu yerda.</Empty>
        )}
      </div>
    </div>
  );
}

function ChatDetail({ chat, mode, onMode, onBack }: { chat: Chat; mode: ChatMode; onMode: (m: ChatMode) => void; onBack: () => void }) {
  const msgs = useAsync(`msgs:${chat.id}`, () => getMessages(chat.id));
  const [sent, setSent] = useState<InboxMessage[]>([]);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeErr, setModeErr] = useState<string | null>(null);

  async function changeMode(m: ChatMode) {
    if (modeBusy || m === mode) return;
    setModeBusy(true);
    setModeErr(null);
    try {
      await setChatMode(chat.id, m);
      onMode(m);
    } catch (e) {
      setModeErr(e instanceof Error ? e.message : "Rejimni o'zgartirib bo'lmadi");
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <section aria-label={`${chat.title} bilan yozishma`} className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Button variant="ghost" size="icon" className="size-10 md:hidden" onClick={onBack} aria-label="Orqaga">
          <ArrowLeft className="size-4" />
        </Button>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold", avOf(chat.title))}>{chat.title.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-[15px] font-extrabold tracking-tight">{chat.title}</h2>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><BrandLogo brand="telegram" height={12} /> Telegram</p>
        </div>
      </div>
      {chat.needsHuman && (
        <p className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-[13px] text-red-700">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> Agent ishonchsiz: bu chatni egasi o'zi yopishi kerak.
        </p>
      )}
      <div className="px-3 pt-2.5" role="radiogroup" aria-label="Chat rejimi">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {CHAT_MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={m.id === mode} disabled={modeBusy} onClick={() => void changeMode(m.id)} title={m.desc} className={cn("h-8 shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors", m.id === mode ? "bg-card text-green-900 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
        {modeErr && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {modeErr}
          </p>
        )}
      </div>

      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-tint-1/60 px-3 py-3">
        {msgs.loading ? (
          <Loading />
        ) : msgs.error ? (
          <ErrorBox message={msgs.error} onRetry={msgs.reload} />
        ) : (
          [...(msgs.data ?? []), ...sent].map((m, i, arr) => (
            <div key={m.id}>
              {(i === 0 || dayKey(arr[i - 1].sentAt) !== dayKey(m.sentAt)) && (
                <p className="my-2 text-center"><span className="rounded-full bg-white/80 px-3 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-sm">{dayLabel(m.sentAt)}</span></p>
              )}
              <Message m={m} chatId={chat.id} onSent={(x) => setSent((s) => [...s, x])} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Message({ m, chatId, onSent }: { m: InboxMessage; chatId: string; onSent: (m: InboxMessage) => void }) {
  const [text, setText] = useState(m.text);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = m.direction === "out";

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      onSent(await sendMessage(chatId, text.trim()));
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  if (m.isDraft) {
    if (done) return null;
    return (
      <div className="rise-in ml-auto max-w-[92%] rounded-2xl border border-dashed border-green-500 bg-white p-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-green-800">
          <Bot className="size-3.5" aria-hidden="true" /> AI qoralama javob (siz tasdiqlamaguncha yuborilmaydi)
        </p>
        {editing ? (
          <>
            <label htmlFor={`d-${m.id}`} className="sr-only">
              Qoralamani tahrirlash
            </label>
            <Textarea id={`d-${m.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-base sm:text-sm" />
          </>
        ) : (
          <p className="rounded-lg bg-tint-1 p-2.5 text-[14px] leading-snug">{text}</p>
        )}
        {err && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {err}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="h-9 px-3.5 text-[13px]" onClick={send} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Yuborish
          </Button>
          <Button variant="outline" className="h-9 px-3.5 text-[13px]" onClick={() => setEditing((e) => !e)} disabled={busy}>
            <Pencil className="size-4" aria-hidden="true" /> {editing ? "Tayyor" : "Tahrirlash"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rise-in flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[82%] rounded-2xl px-3 py-1.5 text-[14px] leading-snug shadow-sm",
          mine ? "rounded-br-sm bg-[#d9fdd3] text-green-950" : "rounded-bl-sm bg-white",
        )}
      >
        {m.author === "ai" && <span className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-green-700"><Bot className="size-3" aria-hidden="true" /> AI</span>}
        {m.voiceUrl && (
          <div className="mb-1 flex items-center gap-2.5 pr-2" aria-label="Ovozli xabar">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-green-600 text-white"><Mic className="size-4" aria-hidden="true" /></span>
            <span className="flex h-6 items-center gap-[3px]" aria-hidden="true">
              {WAVE.map((h, i) => (
                <span key={i} className="w-[3px] rounded-full bg-green-600/70" style={{ height: h }} />
              ))}
            </span>
            <span className="text-[11px] text-muted-foreground">0:07</span>
          </div>
        )}
        <p>{m.transcript ?? m.text}</p>
        {m.transcript && m.text !== m.transcript && <p className="mt-0.5 text-xs text-muted-foreground">Matn: {m.text}</p>}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {hm(m.sentAt)}
          {mine && <CheckCircle2 className="size-3 text-green-600" aria-hidden="true" />}
        </span>
      </div>
    </div>
  );
}
