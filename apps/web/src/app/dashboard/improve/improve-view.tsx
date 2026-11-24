"use client";

import { useState } from "react";
import { Brain, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { decideSuggestion, getImprove } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { Suggestion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ImproveView() {
  const id = useBusinessId();
  const { data, error, loading, reload } = useAsync(`improve:${id}`, () => getImprove(id));
  const [decided, setDecided] = useState<Record<string, Suggestion["status"]>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(s: Suggestion, status: "approved" | "rejected") {
    if (pending) return;
    setPending(s.id);
    setErr(null);
    try {
      await decideSuggestion(s.id, status);
      setDecided((d) => ({ ...d, [s.id]: status }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    } finally {
      setPending(null);
    }
  }

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Ma'lumot yo'q"} onRetry={reload} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Panel title="Auditor takliflari">
        <p className="mb-4 text-sm text-muted-foreground">
          Auditor agent suhbatlarni tahlil qiladi va yaxshilash taklif qiladi. Hech narsa siz tasdiqlamaguncha o'zgarmaydi.
        </p>
        {err && (
          <div className="mb-3">
            <ErrorBox message={err} />
          </div>
        )}
        {!data.suggestions.length ? (
          <Empty>Hozircha takliflar yo'q.</Empty>
        ) : (
          <ul className="space-y-3">
            {data.suggestions.map((s) => {
              const st = decided[s.id] ?? s.status;
              return (
                <li key={s.id} className="rounded-xl border border-border bg-background/40 p-4">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
                  {st === "proposed" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button className="h-11 px-4" onClick={() => decide(s, "approved")} disabled={pending !== null}>
                        {pending === s.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                        Tasdiqlash
                      </Button>
                      <Button variant="outline" className="h-11 px-4" onClick={() => decide(s, "rejected")} disabled={pending !== null}>
                        <X className="size-4" aria-hidden="true" /> Rad etish
                      </Button>
                    </div>
                  ) : (
                    <p role="status" className={cn("mt-3 text-sm font-medium", st === "approved" ? "text-agent" : "text-muted-foreground")}>
                      {st === "approved" ? "Tasdiqlandi" : "Rad etildi"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Xotira">
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="size-4 text-biz" aria-hidden="true" /> Agent eslab qolgan faktlar
        </p>
        {!data.facts.length ? (
          <Empty>Xotira bo'sh.</Empty>
        ) : (
          <ul className="space-y-3 text-sm">
            {data.facts.map((f) => (
              <li key={f.id} className="border-l-2 border-biz/50 pl-3">
                <p>{f.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.source} · {formatWhen(f.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
