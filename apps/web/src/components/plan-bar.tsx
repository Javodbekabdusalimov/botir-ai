"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Crown, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshMe, useAuth } from "@/hooks/use-auth";
import { getPaymentStatus, subscribePro } from "@/lib/api";
import { formatSom } from "@/lib/format";
import { mockActivatePro } from "@/lib/mock";
import { cn } from "@/lib/utils";

const until = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

/** Biznes kabineti: tarif (Start/Pro), muddat, AI kreditlar va [Pro ga o'tish]. */
export function PlanBar() {
  const { user, business } = useAuth();
  const [ref, setRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const bizId = business?.id ?? user?.businessId;

  // To'lov holati har 5s da tekshiriladi
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getPaymentStatus(ref);
        if (!alive) return;
        if (r.status === "paid") {
          if (bizId) mockActivatePro(bizId); // demo rejimda muddatni saqlaydi, real API'da e'tiborsiz
          setPaid(true);
          setRef(null);
          void refreshMe();
        } else if (r.status === "failed" || r.status === "expired") {
          setRef(null);
          setErr("To'lov amalga oshmadi. Qayta urinib ko'ring.");
        }
      } catch {
        /* keyingi tickda qayta uriniladi */
      }
    };
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ref, bizId]);

  if (user?.role !== "business" || !business) return null;
  const pro = business.plan === "pro";
  const waiting = ref !== null;

  async function upgrade() {
    if (busy || !business) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await subscribePro(business.id);
      try {
        window.open(r.payUrl, "_blank", "noopener");
      } catch {}
      setRef(r.paymentRef);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Obunani boshlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold", pro ? "bg-primary text-white" : "bg-muted text-foreground")}>
          <Crown className="size-4" aria-hidden="true" /> {pro ? "Pro" : "Start"}
        </span>
        <span className="text-sm text-muted-foreground">
          {pro && business.planUntil ? <>Muddat: <strong className="text-foreground">{until(business.planUntil)}</strong> gacha</> : "Bepul tarif"}
        </span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Zap className="size-4 text-green-600" aria-hidden="true" /> AI kreditlar: <strong className="tabular-nums text-foreground">{business.aiCredits ?? 0}</strong>
        </span>
      </div>
      <div className="min-w-0 sm:text-right" aria-live="polite">
        {paid ? (
          <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-green-800 sm:justify-end">
            <CheckCircle2 className="size-5 text-green-600" aria-hidden="true" /> Pro faollashdi ✅
          </p>
        ) : waiting ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-green-900 sm:justify-end">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> To&apos;lov kutilmoqda…
          </p>
        ) : !pro ? (
          <Button className="h-11 px-5 font-semibold" onClick={upgrade} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Pro ga o&apos;tish · {formatSom(1000)}/oy
          </Button>
        ) : null}
        {err && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
