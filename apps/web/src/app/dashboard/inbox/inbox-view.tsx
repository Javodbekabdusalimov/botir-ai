"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ErrorBox, Loading } from "@/components/states";
import { TG_MODES } from "@/components/tg-mode";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { getInbox, sendReply } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { InboxItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InboxView() {
  const id = useBusinessId();
  const { data, error, loading, reload } = useAsync(`inbox:${id}`, () => getInbox(id));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kim, qachon, nima yozdi va agent qanday javob tayyorlagan. Rejimni{" "}
        <Link href="/connect/telegram" className="text-agent underline underline-offset-2">
          Telegram sozlamalarida
        </Link>{" "}
        o'zgartirasiz.
      </p>
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty>Hozircha yangi xabar yo'q.</Empty> : (
        <ul className="space-y-4">
          {data.map((it) => (
            <InboxCard key={it.id} item={it} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({ item }: { item: InboxItem }) {
  const [text, setText] = useState(item.draft);
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mode = TG_MODES.find((m) => m.id === item.mode)!;
  const tid = `draft-${item.id}`;

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await sendReply(item.id, text.trim());
      setStatus("sent");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-muted">
          <UserRound className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.customer}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.channel === "telegram" ? <Send className="size-3" aria-hidden="true" /> : <MessageCircle className="size-3" aria-hidden="true" />}
            {item.channel === "telegram" ? "Telegram" : "Veb"} · {formatWhen(item.at)}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", mode.cls)}>{mode.label}</span>
      </div>
      <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">{item.lastMessage}</p>

      {status === "sent" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-agent" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Javob yuborildi
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor={tid} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-agent">
            <Bot className="size-3.5" aria-hidden="true" />
            {status === "needs_human" ? "Agent ishonchsiz: egasi javobi kerak" : "AI qoralama javob"}
          </label>
          <Textarea id={tid} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-base sm:text-sm" />
          {err && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {err}
            </p>
          )}
          <Button className="mt-2 h-11 px-4" onClick={send} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Yuborish
          </Button>
        </div>
      )}
    </li>
  );
}
