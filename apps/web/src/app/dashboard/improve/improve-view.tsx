"use client";

import { useState } from "react";
import { Brain, Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { decideProposal, getFacts, runLoop } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { LoopProposal, ProposalKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND: Record<ProposalKind, string> = { prompt_fix: "Agent ko'rsatmasi", catalog_item: "Katalog", faq: "FAQ" };

export function ImproveView() {
  const id = useBusinessId();
  const facts = useAsync(`facts:${id}`, () => getFacts(id));
  const [proposals, setProposals] = useState<LoopProposal[] | null>(null);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setErr(null);
    try {
      setProposals(await runLoop(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tahlilni ishga tushirib bo'lmadi");
    } finally {
      setRunning(false);
    }
  }

  async function decide(p: LoopProposal, d: "approve" | "reject") {
    if (pending) return;
    setPending(p.id);
    setErr(null);
    try {
      await decideProposal(p.id, d);
      setProposals((list) => list?.map((x) => (x.id === p.id ? { ...x, status: d === "approve" ? "approved" : "rejected" } : x)) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Auditor takliflari">
        <p className="mb-4 text-sm text-muted-foreground">
          Auditor agent suhbatlarni tahlil qiladi, o'zgarishni oltin testlarda sinaydi va taklif qiladi. Hech narsa siz tasdiqlamaguncha qo'llanmaydi.
        </p>
        <Button className="mb-4 h-11 px-4" onClick={run} disabled={running}>
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {running ? "Tahlil qilinmoqda..." : "Yaxshilashni ishga tushirish"}
        </Button>
        {err && (
          <div className="mb-3">
            <ErrorBox message={err} />
          </div>
        )}
        {proposals === null ? (
          <Empty>Hali ishga tushirilmagan. Tugmani bosing.</Empty>
        ) : !proposals.length ? (
          <Empty>Hozircha yangi taklif yo'q: agent yaxshi ishlayapti.</Empty>
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{p.title}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{KIND[p.kind]}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
                  {p.diff.split("\n").map((line, i) => (
                    <span key={i} className={cn("block", line.startsWith("+") && "text-emerald-300", line.startsWith("-") && "text-destructive")}>
                      {line}
                    </span>
                  ))}
                </pre>
                <p className="mt-3 text-sm">
                  Sifat bali: <span className="tabular-nums text-muted-foreground">{p.evalBefore}</span> {"->"}{" "}
                  <span className="font-semibold tabular-nums text-agent">{p.evalAfter}</span>
                  <span className="ml-1 text-xs text-agent">(+{p.evalAfter - p.evalBefore})</span>
                </p>
                {p.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="h-11 px-4" onClick={() => decide(p, "approve")} disabled={pending !== null}>
                      {pending === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                      Tasdiqlash
                    </Button>
                    <Button variant="outline" className="h-11 px-4" onClick={() => decide(p, "reject")} disabled={pending !== null}>
                      <X className="size-4" aria-hidden="true" /> Rad etish
                    </Button>
                  </div>
                ) : (
                  <p role="status" className={cn("mt-3 text-sm font-medium", p.status === "approved" ? "text-agent" : "text-muted-foreground")}>
                    {p.status === "approved" ? "Tasdiqlandi" : p.status === "rejected" ? "Rad etildi" : "Qaytarib olindi"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Xotira">
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="size-4 text-biz" aria-hidden="true" /> Agent eslab qolgan faktlar
        </p>
        {facts.loading ? (
          <Loading />
        ) : facts.error ? (
          <ErrorBox message={facts.error} onRetry={facts.reload} />
        ) : !facts.data?.length ? (
          <Empty>Xotira bo'sh.</Empty>
        ) : (
          <ul className="space-y-3 text-sm">
            {facts.data.map((f) => (
              <li key={f.id} className="border-l-2 border-biz/50 pl-3">
                <p>{f.fact}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.source} · ishonch {Math.round(f.confidence * 100)}% · {formatWhen(f.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
