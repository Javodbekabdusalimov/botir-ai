"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { Empty, ErrorBox } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAsync } from "@/hooks/use-async";
import { decideAction, getActions } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { UserAction, UserActionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<UserActionStatus, { label: string; cls: string }> = {
  pending: { label: "Ruxsat kutmoqda", cls: "bg-biz-soft text-biz" },
  sending: { label: "Yuborilmoqda", cls: "bg-tint-2 text-green-900" },
  sent: { label: "Yuborildi", cls: "bg-green-600 text-white" },
  rejected: { label: "Bekor qilindi", cls: "bg-muted text-muted-foreground" },
  failed: { label: "Xato", cls: "bg-red-50 text-red-700" },
};

export function MeActions() {
  const list = useAsync("me-actions", getActions);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(a: UserAction, d: "approve" | "reject") {
    if (busy) return;
    setBusy(a.id + d);
    setErr(null);
    try {
      await decideAction(a.id, d);
      list.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saqlab bo'lmadi, qayta urinib ko'ring");
    } finally {
      setBusy(null);
    }
  }

  if (list.loading) return <div className="mt-8 space-y-3"><div className="shimmer h-36 rounded-2xl" /><div className="shimmer h-36 rounded-2xl" /></div>;
  if (list.error || !list.data) return <div className="mt-8"><ErrorBox message={list.error ?? "Ro'yxatni olib bo'lmadi"} onRetry={list.reload} /></div>;
  if (!list.data.length)
    return (
      <div className="mt-8 space-y-4">
        <Empty>Hozircha amal yo&apos;q. Telegramdagi Saqlangan xabarlarga &quot;Botir, ...&quot; deb yozing, agent shu yerda ruxsat so&apos;raydi.</Empty>
        <Link href="/me/telegram" className={cn(buttonVariants(), "h-11 px-5 font-semibold")}>
          Telegramni ulash
        </Link>
      </div>
    );

  const sorted = [...list.data].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || +new Date(b.createdAt) - +new Date(a.createdAt));
  return (
    <div className="mt-8 space-y-4">
      {err && <ErrorBox message={err} />}
      <ul className="space-y-4">
        {sorted.map((a) => (
          <li key={a.id} className={cn("rounded-3xl border bg-card p-5 shadow-soft", a.status === "pending" ? "border-amber-300" : "border-border")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Kimga</p>
                <h2 className="truncate font-display text-lg font-bold">{a.peerTitle}</h2>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS[a.status].cls)}>{STATUS[a.status].label}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Xabar matni</p>
            <p className="mt-1 rounded-2xl rounded-tl-sm bg-tint-1 p-3 text-[15px] leading-relaxed">{a.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {a.reason ? `${a.reason} · ` : ""}
              {formatWhen(a.createdAt)}
            </p>
            {a.status === "pending" && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button className="h-12 flex-1 text-base font-semibold" disabled={busy !== null} onClick={() => decide(a, "approve")}>
                  {busy === a.id + "approve" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />} Yuborish
                </Button>
                <Button variant="outline" className="h-12 px-5" disabled={busy !== null} onClick={() => decide(a, "reject")}>
                  {busy === a.id + "reject" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />} Bekor
                </Button>
              </div>
            )}
            {a.status === "sent" && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700">
                <Check className="size-4" aria-hidden="true" /> Telegram orqali yuborildi
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
