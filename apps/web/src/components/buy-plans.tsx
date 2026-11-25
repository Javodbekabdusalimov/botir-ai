"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { ErrorBox } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/use-async";
import { useAuth } from "@/hooks/use-auth";
import { UnauthorizedError, getBillingMe, subscribePlan } from "@/lib/api";
import { formatSom, formatWhen } from "@/lib/format";
import { openExternal } from "@/lib/telegram";
import { cn } from "@/lib/utils";

type Paid = "pro" | "max";
const NAME: Record<Paid, string> = { pro: "Pro", max: "Max" };
const LOGIN = "/login?next=/narxlar";

/**
 * /narxlar: Pro va Max sotib olish. Narx va 1-oy narxi faqat GET /billing/me dan (mehmon uchun ham), kodda yozilmaydi.
 * Kirmagan → login; kirgan → POST /billing/subscribe → to'lov sahifasi (brauzerda shu tab, Telegram ichida openLink).
 */
export function BuyPlans() {
  const router = useRouter();
  const { status } = useAuth();
  const me = useAsync(`billing-me|${status}`, getBillingMe);
  const [busy, setBusy] = useState<Paid | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function buy(plan: Paid) {
    if (status !== "in") return router.push(LOGIN);
    setBusy(plan);
    setErr(null);
    try {
      const r = await subscribePlan(plan);
      openExternal(r.payUrl); // sahifa almashadi: busy holati qoladi
    } catch (e) {
      setBusy(null);
      if (e instanceof UnauthorizedError) return router.push(LOGIN);
      setErr(e instanceof Error ? e.message : "To'lovni boshlab bo'lmadi");
    }
  }

  if (me.error) return <div className="mt-8"><ErrorBox message={`Narxlarni yuklab bo'lmadi: ${me.error}`} onRetry={me.reload} /></div>;
  const b = me.data;
  return (
    <section aria-label="Tarif sotib olish" className="mt-8">
      {b && b.plan !== "free" && b.expiresAt && (
        <p className="mb-3 rounded-xl border border-tint-3 bg-tint-1 p-3 text-sm">
          Hozirgi tarifingiz: <b>{NAME[b.plan]}</b>, {formatWhen(b.expiresAt)} gacha.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["pro", "max"] as const).map((plan) => {
          const p = b?.prices[plan];
          const label = !p ? "Yuklanmoqda..." : b.introAvailable ? `${NAME[plan]} olish — 1-oy ${formatSom(p.introPrice)}` : `${NAME[plan]} olish — ${formatSom(p.price)}/oy`;
          return (
            <article key={plan} className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-soft", plan === "pro" ? "border-primary" : "border-border")}>
              <h2 className="font-display text-xl font-bold">{NAME[plan]}</h2>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">{p ? `${formatSom(p.price)}/oy` : "—"}</p>
              {p && b.introAvailable && <p className="text-sm text-muted-foreground">Birinchi oy {formatSom(p.introPrice)}</p>}
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-800" aria-hidden="true" />{p ? `Kuniga ${formatSom(p.dailyTokens).replace(" so'm", "")} token` : "Kunlik token"}</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-800" aria-hidden="true" />Agent savdolashadi va buyurtma beradi</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-800" aria-hidden="true" />Telegram akkauntini ulash</li>
              </ul>
              <Button className="mt-5 h-12 w-full" disabled={!p || busy !== null} onClick={() => buy(plan)}>
                {busy === plan && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {busy === plan ? "To'lov sahifasi ochilmoqda..." : label}
              </Button>
            </article>
          );
        })}
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      {b && <p className="mt-3 text-xs text-muted-foreground">Free: kuniga {b.prices.freeDailyRequests} ta qidiruv bepul. Tokenlar har kuni 00:00 da yangilanadi. Obuna {b.prices.periodDays} kunga.</p>}
    </section>
  );
}
