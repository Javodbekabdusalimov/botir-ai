"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, Loader2, Mic, Send, UserRound } from "lucide-react";
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

const modeOf = (m: ChatMode) => CHAT_MODES.find((x) => x.id === m)!;

export function InboxView() {
  const id = useBusinessId();
  const chats = useAsync(`chats:${id}`, () => getChats(id));
  const [selected, setSelected] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, ChatMode>>({});
  const list = chats.data;
  const current = list?.find((c) => c.id === selected) ?? null;

  if (chats.loading) return <Loading />;
  if (chats.error || !list) return <ErrorBox message={chats.error ?? "Ma'lumot yo'q"} onRetry={chats.reload} />;
  if (!list.length) return <Empty>Hozircha chatlar yo'q. Telegramni ulang, yozishmalar shu yerda ko'rinadi.</Empty>;

  const urgent = list.filter((c) => c.needsHuman).length;
  // Egasi javobi kerak bo'lganlar tepada; qolgani oxirgi xabar bo'yicha
  const sorted = [...list].sort((a, b) => Number(b.needsHuman) - Number(a.needsHuman) || +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  return (
    <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
      <div className={cn(current && "hidden md:block")}>
        {urgent > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-biz/40 bg-biz/10 p-3 text-sm text-biz" role="status">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> {urgent} ta chatda sizning javobingiz kerak
          </p>
        )}
        <ul className="space-y-2" aria-label="Chatlar">
          {sorted.map((c) => {
            const mode = modes[c.id] ?? c.mode;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  aria-current={c.id === selected ? "true" : undefined}
                  className={cn("w-full rounded-xl border p-3 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]", c.needsHuman ? "border-biz/60 border-l-4 bg-biz/5" : "border-border bg-card/60", c.id === selected && "ring-2 ring-agent")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("flex min-w-0 items-center gap-1.5", c.unread ? "font-semibold" : "font-medium")}>
                      {c.needsHuman && <AlertCircle className="size-4 shrink-0 text-biz" aria-label="Egasi javobi kerak" />}
                      <span className="truncate">{c.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{c.lastMessageText}</span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", modeOf(mode).cls)}>{modeOf(mode).label}</span>
                    {!!c.unread && <span className="rounded-full bg-agent px-2 py-0.5 text-xs font-bold text-primary-foreground">{c.unread}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cn(!current && "hidden md:block")}>
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
    <section aria-label={`${chat.title} bilan yozishma`} className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-11 md:hidden" onClick={onBack} aria-label="Orqaga">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{chat.title}</h2>
      </div>
      {chat.needsHuman && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-biz/10 p-2 text-sm text-biz">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> Agent ishonchsiz: bu chatni egasi o'zi yopishi kerak.
        </p>
      )}
      <div className="mt-3" role="radiogroup" aria-label="Chat rejimi">
        <div className="flex flex-wrap gap-1.5">
          {CHAT_MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={m.id === mode} disabled={modeBusy} onClick={() => void changeMode(m.id)} title={m.desc} className={cn("min-h-11 rounded-full border px-3 text-xs font-semibold", m.id === mode ? cn("border-transparent", m.cls) : "border-border text-muted-foreground")}>
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

      <div className="mt-4 space-y-3">
        {msgs.loading ? (
          <Loading />
        ) : msgs.error ? (
          <ErrorBox message={msgs.error} onRetry={msgs.reload} />
        ) : (
          [...(msgs.data ?? []), ...sent].map((m) => <Message key={m.id} m={m} chatId={chat.id} onSent={(x) => setSent((s) => [...s, x])} />)
        )}
      </div>
    </section>
  );
}

function Message({ m, chatId, onSent }: { m: InboxMessage; chatId: string; onSent: (m: InboxMessage) => void }) {
  const [text, setText] = useState(m.text);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
      <div className="rise-in rounded-xl border border-dashed border-agent/60 bg-agent/5 p-3">
        <label htmlFor={`d-${m.id}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-agent">
          <Bot className="size-3.5" aria-hidden="true" /> AI qoralama javob (siz tasdiqlamaguncha yuborilmaydi)
        </label>
        <Textarea id={`d-${m.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-base sm:text-sm" />
        {err && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {err}
          </p>
        )}
        <Button className="mt-2 h-11 px-4" onClick={send} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          Tasdiqlab yuborish
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("rise-in flex flex-col", mine ? "items-end" : "items-start")}>
      <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-agent/15" : "bg-muted/70")}>
        {m.voiceUrl && (
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Mic className="size-3" aria-hidden="true" /> Ovozli xabar
          </p>
        )}
        <p>{m.transcript ?? m.text}</p>
        {m.transcript && m.text !== m.transcript && <p className="mt-1 text-xs text-muted-foreground">Matn: {m.text}</p>}
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        {m.author === "ai" ? <Bot className="size-3" aria-hidden="true" /> : m.author === "owner" ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <UserRound className="size-3" aria-hidden="true" />}
        {m.author === "ai" ? "AI" : m.author === "owner" ? "Siz" : "Mijoz"} · {formatWhen(m.sentAt)}
      </p>
    </div>
  );
}
