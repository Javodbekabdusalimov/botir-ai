"use client";

import Link from "next/link";
import { useAsync } from "@/hooks/use-async";
import { getBillingMe } from "@/lib/api";
import type { BillingMe } from "@/lib/types";

const n = (x: number) => x.toLocaleString("ru-RU").replace(/\s/g, " ");

/** "Tarif: Pro · bugun qoldi 63 000 / 100 000 token · 00:00 da yangilanadi" (GET /billing/me). Free'da qolgan qidiruvlar. */
export function PlanTokensText({ b }: { b: BillingMe }) {
  return (
    <>
      Tarif: <strong className="text-foreground">{b.plan === "max" ? "Max" : b.plan === "pro" ? "Pro" : "Free"}</strong> ·{" "}
      {b.plan === "free" ? `bugun ${b.freeLeftToday} ta bepul qidiruv qoldi` : <>bugun qoldi <strong className="tabular-nums text-foreground">{n(b.tokensLeftToday)} / {n(b.dailyTokens)}</strong> token</>} · 00:00 da yangilanadi ·{" "}
      <Link href="/narxlar" className="font-medium text-green-800 underline-offset-2 hover:underline">Tariflar</Link>
    </>
  );
}

/** O'zi yuklaydigan blok (/me/actions); xato bo'lsa jim (asosiy sahifaga xalaqit bermaydi). */
export function PlanTokens() {
  const { data } = useAsync("billing-me", getBillingMe);
  return data ? <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground"><PlanTokensText b={data} /></p> : null;
}
