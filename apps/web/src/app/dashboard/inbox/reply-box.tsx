"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/lib/api";
import { friendlyError } from "@/lib/friendly-error";
import type { InboxMessage } from "@/lib/types";

/** Egasining qo'lda javobi. Xatoda qizil matn chiqadi, qoralama o'chmaydi. */
export function ReplyBox({ chatId, onSent }: { chatId: string; onSent: (m: InboxMessage) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const t = text.trim();
    if (busy || !t) return;
    setBusy(true);
    setErr(null);
    try {
      onSent(await sendMessage(chatId, t));
      setText("");
    } catch (e) {
      setErr(friendlyError(e instanceof Error ? e.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="border-t border-border p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {err && (
        <p role="alert" className="mb-1.5 text-xs text-destructive">
          {err}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor={`reply-${chatId}`} className="sr-only">
          Javob yozish
        </label>
        <Textarea
          id={`reply-${chatId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Javob yozish…"
          className="min-h-11 flex-1 text-base sm:text-sm"
        />
        <Button type="submit" className="size-11 shrink-0" disabled={busy || !text.trim()} aria-label="Yuborish">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        </Button>
      </div>
    </form>
  );
}
