"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, CalendarClock, Loader2, MapPin, Play, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { planAssistant, startNegotiation } from "@/lib/api";
import type { AssistantTask } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  from: "me" | "agent";
  text: string;
  tasks?: AssistantTask[];
}

const EXAMPLES = [
  "Ertaga 6 kishilik osh joy band qil",
  "Cobalt uchun moy almashtirish, shanba kuni",
  "Ertaga 19:00 ga 4 kishilik osh joy band qil, mashinaga moy almashtirishga ham yozdir",
];

export function AssistantChat() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "agent", text: "Salom! Men sizning shaxsiy agentingizman. Nima kerak? Men bizneslar bilan o'zim gaplashaman, siz faqat tasdiqlaysiz." },
  ]);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length, busy]);

  async function send(raw: string) {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    setError(null);
    setMsgs((m) => [...m, { id: m.length, from: "me", text: t }]);
    setBusy(true);
    try {
      const { tasks } = await planAssistant(t);
      setMsgs((m) => [
        ...m,
        tasks.length
          ? { id: m.length, from: "agent", text: tasks.length === 1 ? "Tushundim. Bitta vazifa:" : `Tushundim. ${tasks.length} ta vazifaga ajratdim:`, tasks }
          : { id: m.length, from: "agent", text: "Tushunmadim. Nima kerakligini aniqroq ayting: masalan, \"Ertaga 6 kishilik osh joy band qil\"." },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent javob bermadi, qayta urinib ko'ring");
      setText(t); // yozilganini yo'qotmaymiz
    } finally {
      setBusy(false);
    }
  }

  async function start(task: AssistantTask) {
    if (starting) return;
    setStarting(task.id);
    setError(null);
    try {
      const s = await startNegotiation(task.businessId, task.request);
      router.push(`/live/${encodeURIComponent(s.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Muzokarani boshlab bo'lmadi");
      setStarting(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-6 sm:py-10">
      <p className="text-sm font-medium text-agent">Shaxsiy agent</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Yordamchingizga ayting</h1>

      <div className="mt-6 min-h-[40vh] space-y-3" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={cn("rise-in flex gap-2", m.from === "me" && "justify-end")}>
            {m.from === "agent" && <Bot className="mt-2 size-5 shrink-0 text-agent" aria-hidden="true" />}
            <div className={cn("max-w-[88%] space-y-3", m.from === "me" && "text-right")}>
              <p className={cn("inline-block rounded-2xl px-4 py-2.5 text-left text-[15px]", m.from === "me" ? "bg-agent/15" : "border border-border bg-card/60")}>{m.text}</p>
              {m.tasks?.map((t) => (
                <article key={t.id} className="rounded-2xl border border-agent/30 bg-card p-4 text-left">
                  <h2 className="font-display text-base font-bold">{t.title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.businessName}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {t.area && (
                      <li className="flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden="true" /> {t.area}
                      </li>
                    )}
                    {t.when && (
                      <li className="flex items-center gap-1">
                        <CalendarClock className="size-3" aria-hidden="true" /> {t.when}
                      </li>
                    )}
                    {t.people && (
                      <li className="flex items-center gap-1">
                        <Users className="size-3" aria-hidden="true" /> {t.people} kishi
                      </li>
                    )}
                  </ul>
                  <Button className="mt-3 h-11 w-full px-4 sm:w-auto" disabled={starting !== null} onClick={() => start(t)}>
                    {starting === t.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                    Muzokarani boshlash
                  </Button>
                </article>
              ))}
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Agent reja tuzmoqda...
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setText(ex)} className="min-h-11 shrink-0 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
            {ex.length > 34 ? `${ex.slice(0, 32)}...` : ex}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-end gap-2"
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
