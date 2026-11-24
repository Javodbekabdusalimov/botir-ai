"use client";

import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Brain, Check, History, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { decideProposal, getFacts, modeStore, rollbackLoop, runLoop } from "@/lib/api";
import { addVersion, popVersion, useVersions } from "@/lib/versions-store";
import { formatWhen } from "@/lib/format";
import type { LoopProposal, ProposalKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const TESTS = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KIND: Record<ProposalKind, string> = { prompt_fix: "Agent ko'rsatmasi", catalog_item: "Katalog", faq: "FAQ" };

export function ImproveView() {
  const id = useBusinessId();
  const facts = useAsync(`facts:${id}`, () => getFacts(id));
  const [proposals, setProposals] = useState<LoopProposal[] | null>(null);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const demo = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot, modeStore.getServerSnapshot);
  const versions = useVersions(id);
  // Real rejimda /loop/run ~90s: har ~11s da bitta test savol. Demoda tezlashtirilgan.
  const stepMs = demo ? 900 : 11_000;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => Math.min(TESTS, n + 1)), stepMs);
    return () => clearInterval(t);
  }, [running, stepMs]);

  async function run() {
    if (running) return;
    setRunning(true);
    setTick(0);
    setNote(null);
    setErr(null);
    try {
      const [res] = await Promise.all([runLoop(id), demo ? sleep(TESTS * stepMs) : Promise.resolve()]);
      setProposals(res);
    } catch (e) {
      setErr(e instanceof Error ? friendlyError(e.message) : "Tahlilni ishga tushirib bo'lmadi");
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
      if (d === "approve") addVersion(id, { id: p.id, title: p.title, score: p.evalAfter, at: new Date().toISOString() });
      setProposals((list) => list?.map((x) => (x.id === p.id ? { ...x, status: d === "approve" ? "approved" : "rejected" } : x)) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    } finally {
      setPending(null);
    }
  }

  async function rollback() {
    if (rolling) return;
    setRolling(true);
    setErr(null);
    try {
      await rollbackLoop(id);
      const last = versions[0];
      popVersion(id);
      if (last) setProposals((list) => list?.map((x) => (x.id === last.id ? { ...x, status: "rolled_back" } : x)) ?? null);
      setNote("Oldingi versiyaga qaytarildi.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Qaytarib bo'lmadi");
    } finally {
      setRolling(false);
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
        {running && (
          <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-tint-3 bg-tint-1 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {Math.min(TESTS, tick + 1)}/{TESTS}: {TESTS} ta test savolda tekshirilmoqda…
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
              <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.max(6, (tick / TESTS) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-green-900/80">{demo ? "Demo: tezlashtirilgan." : "Odatda ~90 soniya."} Sahifani yopmang.</p>
          </div>
        )}
        {note && (
          <p role="status" className="mb-3 rounded-lg bg-tint-1 px-3 py-2 text-sm font-medium text-green-900">
            {note}
          </p>
        )}
        {err && (
          <div className="mb-3">
            <ErrorBox message={err} onRetry={run} />
          </div>
        )}
        {running ? null : proposals === null ? (
          <Empty>Hali ishga tushirilmagan. [Yaxshilash] tugmasini bosing: auditor topilmalarini ko&apos;rasiz.</Empty>
        ) : !proposals.length ? (
          <Empty>Hozircha yangi taklif yo'q: agent yaxshi ishlayapti.</Empty>
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{p.title}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{KIND[p.kind]}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
                  {p.diff.split("\n").map((line, i) => (
                    <span key={i} className={cn("block", line.startsWith("+") && "text-green-700", line.startsWith("-") && "text-destructive")}>
                      {line}
                    </span>
                  ))}
                </pre>
                <div className="mt-3 space-y-2 text-xs" aria-label={`Sifat bali: ${p.evalBefore}% dan ${p.evalAfter}% gacha`}>
                  {(
                    [
                      ["Oldin", p.evalBefore, "bg-neutral-400"],
                      ["Keyin", p.evalAfter, "bg-primary"],
                    ] as const
                  ).map(([l, v, c]) => (
                    <div key={l} className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2">
                      <span className="text-muted-foreground">{l}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full transition-[width] duration-700 ease-out", c)} style={{ width: `${v}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{v}%</span>
                    </div>
                  ))}
                  <p className="font-semibold text-green-700">+{p.evalAfter - p.evalBefore} ball</p>
                </div>
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
                  <p role="status" className={cn("mt-3 text-sm font-medium", p.status === "approved" ? "text-green-700" : "text-muted-foreground")}>
                    {p.status === "approved" ? "Tasdiqlandi" : p.status === "rejected" ? "Rad etildi" : "Qaytarib olindi"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="space-y-6">
      <Panel title="Versiyalar tarixi">
        {versions.length === 0 ? (
          <Empty>Hali tasdiqlangan o&apos;zgarish yo&apos;q. Taklifni tasdiqlasangiz, versiya shu yerda paydo bo&apos;ladi.</Empty>
        ) : (
          <ol className="space-y-3">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <History className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-muted-foreground">
                    v{versions.length - i} · ball {v.score}% · {formatWhen(v.at)}
                  </p>
                </div>
                {i === 0 && (
                  <Button variant="outline" className="h-11 shrink-0 px-3" onClick={rollback} disabled={rolling}>
                    {rolling ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
                    Rollback
                  </Button>
                )}
              </li>
            ))}
          </ol>
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
    </div>
  );
}
