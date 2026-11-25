"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { ErrorBox, Loading } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { ForbiddenError, UnauthorizedError, getAdminOverview } from "@/lib/api";
import { formatSom } from "@/lib/format";
import type { AdminOverview } from "@/lib/types";
import { ClientsTable, PaymentsTable } from "./admin-tables";
import { useLive } from "./use-live";

const REFRESH_MS = 30_000;
const num = (n: number) => n.toLocaleString("ru-RU").replace(/\s/g, " ");
const usd = (n: number) => `$${n.toFixed(2)}`;

/** Egalar paneli: KPI, mijozlar va to'lovlar. Har 30 s yangilanadi; mock yo'q (soxta raqam chalg'itadi). */
export function AdminPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  const overview = useLive("overview", getAdminOverview, tick);

  if (overview.error instanceof UnauthorizedError) {
    return (
      <Gate title="Kirish kerak" text="Admin paneli uchun hisobingizga kiring.">
        <Link href="/login?next=/admin" className={buttonVariants({ className: "mt-4 h-11 px-5" })}>Kirish</Link>
      </Gate>
    );
  }
  if (overview.error instanceof ForbiddenError) return <Gate title="Ruxsat yo'q" text="Bu sahifa faqat Life Assistant egalari uchun." />;

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Admin</h1>
        <button type="button" onClick={() => setTick((n) => n + 1)} className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>
          <RefreshCw className="size-4" aria-hidden="true" /> Yangilash
        </button>
      </header>
      {overview.error != null && <ErrorBox message={overview.error instanceof Error ? overview.error.message : "Yuklab bo'lmadi"} />}
      {overview.data ? <Kpis o={overview.data} /> : !overview.error && <Loading />}
      <ClientsTable tick={tick} />
      <PaymentsTable tick={tick} />
    </div>
  );
}

function Gate({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-3 font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}

function Kpis({ o }: { o: AdminOverview }) {
  const { usedToday, cap } = o.globalTokens;
  const pct = cap > 0 ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0;
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: "Daromad bugun", value: formatSom(o.revenue.today), sub: `30 kun: ${formatSom(o.revenue.days30)}` },
    { label: "Daromad jami", value: formatSom(o.revenue.all), sub: "faqat haqiqiy to'lovlar" },
    { label: "To'layotgan mijozlar", value: num(o.payingClients), sub: `Pro ${o.byPlan.pro} · Max ${o.byPlan.max}` },
    { label: "Obunalar", value: num(o.paidSubscriptions.intro + o.paidSubscriptions.full), sub: `1-oy: ${o.paidSubscriptions.intro} · to'liq: ${o.paidSubscriptions.full}` },
    { label: "TEST to'lovlar", value: num(o.testPaymentsPaid), sub: "pul kelmagan" },
    { label: "Foydalanuvchilar", value: num(o.users.total), sub: `bugun +${o.users.newToday} · bizneslar ${o.businesses}` },
    { label: "Muzokaralar", value: num(o.negotiations.today), sub: `30 kun: ${num(o.negotiations.days30)} · buyurtma bugun ${o.ordersToday}` },
    { label: "AI xarajati bugun", value: usd(o.aiCostUsd.today), sub: `30 kun: ${usd(o.aiCostUsd.days30)}` },
    { label: "Claude tokenlari bugun", value: num(usedToday), sub: cap > 0 ? `${num(cap)} dan · ${pct}%` : "cheklovsiz" },
  ];
  return (
    <section aria-label="Ko'rsatkichlar" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
          <p className="mt-1 truncate font-display text-xl font-bold tabular-nums sm:text-2xl">{t.value}</p>
          {t.sub && <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>}
          {t.label.startsWith("Claude") && cap > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-green-700"} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
