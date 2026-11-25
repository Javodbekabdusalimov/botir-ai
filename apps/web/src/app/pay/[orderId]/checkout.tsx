"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BadgeCheck, Check, CircleCheck, Home, Loader2, Lock, SearchX, ShieldCheck, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand-logos";
import { NotFoundError, getPaymentStatus } from "@/lib/api";
import { bizPhoto } from "@/lib/photos";
import { formatSom, formatWhen, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Summary {
  businessId: string;
  businessName: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  discountPct: number;
  link?: string;
}
type Method = "payme" | "click" | "uzum";
const METHODS: { key: Method; hint: string }[] = [
  { key: "payme", hint: "Payme ilovasi yoki karta" },
  { key: "click", hint: "Click ilovasi yoki karta" },
  { key: "uzum", hint: "Uzum Bank / Uzum Pay" },
];

function Steps({ step }: { step: 0 | 1 | 2 }) {
  const items = ["Buyurtma", "To'lov", "Tayyor"];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Bosqichlar">
      {items.map((t, i) => (
        <li key={t} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
          <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", i < step ? "bg-green-600 text-white" : i === step ? "bg-green-600 text-white ring-4 ring-green-200" : "bg-muted text-muted-foreground")}>
            {i < step ? <Check className="size-4" aria-hidden="true" /> : i + 1}
          </span>
          <span className={cn("font-semibold", i > step && "text-muted-foreground")}>{t}</span>
          {i < items.length - 1 && <span className={cn("h-0.5 w-6 rounded sm:w-12", i < step ? "bg-green-600" : "bg-border")} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export function Checkout({ orderId }: { orderId: string }) {
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(`botir.checkout.${orderId}`);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const sum = useMemo<Summary | null>(() => (raw ? (JSON.parse(raw) as Summary) : null), [raw]);
  const ready = true;
  const [method, setMethod] = useState<Method>("payme");
  const [phase, setPhase] = useState<"idle" | "paying" | "paid" | "failed">("idle");
  const [amount, setAmount] = useState<number | null>(null);
  const [paidAt, setPaidAt] = useState<string>("");
  const [notFound, setNotFound] = useState(false);
  // To'lov havolasi va test/real belgisi serverdan (boshqa telefonda ham ishlaydi, localStorage shart emas)
  const [serverLink, setServerLink] = useState<string | null>(null);
  const [serverTest, setServerTest] = useState<boolean | null>(null);
  const [checkErr, setCheckErr] = useState(false);

  useEffect(() => {
    getPaymentStatus(orderId)
      .then((r) => {
        if (typeof r.amount === "number") setAmount(r.amount);
        if (r.payUrl) setServerLink(r.payUrl);
        if (typeof r.isTest === "boolean") setServerTest(r.isTest);
        if (r.status === "paid") {
          setPhase("paid");
          setPaidAt(r.paidAt ?? new Date().toISOString());
        }
      })
      .catch((e) => {
        if (e instanceof NotFoundError) setNotFound(true);
        else setCheckErr(true);
      });
  }, [orderId]);

  useEffect(() => {
    if (phase !== "paying") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getPaymentStatus(orderId);
        if (!alive) return;
        setCheckErr(false);
        if (r.status === "paid") {
          setPaidAt(r.paidAt ?? new Date().toISOString());
          setPhase("paid");
        } else if (r.status === "failed" || r.status === "expired") setPhase("failed");
      } catch {
        if (alive) setCheckErr(true);
      }
    };
    const t = setInterval(tick, 2000);
    void tick();
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, orderId]);

  const link = serverLink ?? sum?.link ?? null;
  const isTest = serverTest ?? (link ? link.includes("/pay/test/") : true);

  async function pay() {
    if (phase === "paying") return;
    setPhase("paying");
    if (link && !isTest) {
      window.location.href = link; // haqiqiy TezCheck hisobi
      return;
    }
    // TEST to'lov: backend /pay/test/:orderId (haqiqiy pul emas)
    const base = link ? new URL(link).origin : (process.env.NEXT_PUBLIC_API_URL ?? "");
    if (base) {
      try {
        await fetch(`${base}/pay/test/${encodeURIComponent(orderId)}`, { method: "POST", mode: "no-cors" });
      } catch {}
    }
  }

  if (notFound) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-7rem)] bg-gradient-to-b from-tint-1 via-background to-tint-1/60">
        <section role="alert" className="slide-up mx-4 mt-16 max-w-md sm:mx-auto rounded-2xl border border-border bg-card p-8 text-center shadow-lift sm:mt-24">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold">Buyurtma topilmadi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            #{shortId(orderId)} raqamli buyurtma yo&apos;q yoki muddati o&apos;tgan. Hech qanday to&apos;lov olinmaydi.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-green-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200">
              <Home className="size-4" aria-hidden="true" /> Bosh sahifa
            </Link>
            <Link href="/assistant" className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200">
              Yangi so&apos;rov
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const total = amount ?? sum?.total ?? 0;
  const subtotal = sum ? sum.items.reduce((s, i) => s + i.price * i.qty, 0) : total;
  const discount = Math.max(0, subtotal - total);
  const step = phase === "paid" ? 2 : 1;

  return (
    <div className="min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-7rem)] bg-gradient-to-b from-tint-1 via-background to-tint-1/60">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:py-12">
        <nav aria-label="Yo'l" className="mb-3 text-xs font-medium text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Bosh</Link> / <Link href="/assistant" className="hover:text-foreground">Yordamchi</Link> / <span className="text-foreground">To&apos;lov</span>
        </nav>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">TezCheck: xavfsiz to&apos;lov</h1>
            <p className="mt-1 text-sm text-muted-foreground">Buyurtma #{shortId(orderId)} · {isTest ? "TEST rejim: haqiqiy pul o'tmaydi" : "To'lov TezCheck orqali qabul qilinadi"}</p>
            {checkErr && <p role="alert" className="mt-1 text-sm text-destructive">Holatni tekshirib bo&apos;lmadi, qayta urinilmoqda…</p>}
          </div>
          <Steps step={step} />
        </div>

        {phase === "paid" ? (
          <section role="status" className="slide-up mx-auto max-w-xl rounded-2xl border border-green-500/30 bg-card p-8 text-center shadow-lift">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-green-600 text-white shadow-lift">
              <svg viewBox="0 0 24 24" className="check-draw size-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h2 className="mt-5 font-display text-3xl font-extrabold text-green-900">{isTest ? "TEST to'lov bajarildi" : "To'landi ✅"}</h2>
            <p className="mt-1 text-muted-foreground">{isTest ? "TEST to'lov: haqiqiy pul o'tmadi. Buyurtma biznesga yuborildi." : "TezCheck orqali to'landi. Buyurtma biznesga yuborildi."}</p>
            <dl className="mx-auto mt-6 divide-y divide-border rounded-2xl border border-border bg-muted/40 text-left text-sm">
              {[
                ["Summa", formatSom(total)],
                ["Biznes", sum?.businessName ?? "-"],
                ...(isTest ? [] : [["Usul", METHODS.find((m) => m.key === method)?.key.toUpperCase() ?? ""]]),
                ["Vaqt", paidAt ? formatWhen(paidAt) : ""],
                ["Buyurtma", `#${orderId.slice(-6).toUpperCase()}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/assistant" className="mt-6 flex h-12 items-center justify-center rounded-xl bg-green-600 text-base font-bold text-white hover:bg-green-700">
              Yordamchiga qaytish
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section aria-labelledby="pm" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <h2 id="pm" className="font-sans text-lg font-extrabold">To&apos;lov usulini tanlang</h2>
              <div role="radiogroup" aria-labelledby="pm" className="mt-4 grid gap-3">
                {METHODS.map((m) => {
                  const on = method === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMethod(m.key)}
                      className={cn("flex min-h-16 items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring", on ? "border-green-600 bg-tint-1 shadow-soft" : "border-border hover:border-tint-3")}
                    >
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-green-600 bg-green-600" : "border-input")}>{on && <span className="size-2 rounded-full bg-white" />}</span>
                      <span className="flex h-10 w-28 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-2">
                        <BrandLogo brand={m.key} height={m.key === "payme" ? 18 : 22} />
                        {m.key !== "payme" && <span className="text-sm font-extrabold capitalize text-foreground">{m.key}</span>}
                      </span>
                      <span className="min-w-0 text-sm text-muted-foreground">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
              {phase === "failed" && (
                <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  To&apos;lov amalga oshmadi yoki muddati tugadi. Pul yechilmagan.
                </p>
              )}
              <button
                type="button"
                onClick={pay}
                disabled={phase === "paying" || !ready || total <= 0}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 text-base font-bold text-white shadow-lift transition-colors hover:bg-green-700 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {phase === "paying" ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Lock className="size-5" aria-hidden="true" />}
                {phase === "paying" ? "To'lov tekshirilmoqda…" : `${formatSom(total)} to'lash`}
              </button>
              <ul className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                {[
                  [ShieldCheck, "Himoyalangan to'lov"],
                  [Zap, "Bir zumda tasdiq"],
                  [BadgeCheck, "Faqat tasdiqdan keyin"],
                ].map(([Icon, t]) => {
                  const I = Icon as typeof ShieldCheck;
                  return (
                    <li key={t as string} className="flex items-center gap-2 rounded-xl bg-tint-1 px-3 py-2.5 font-medium text-green-900">
                      <I className="size-4 shrink-0" aria-hidden="true" /> {t as string}
                    </li>
                  );
                })}
              </ul>
            </section>

            <aside aria-label="Buyurtma xulosasi" className="h-fit overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="relative h-32">
                <Image src={bizPhoto(sum?.businessId ?? "")} alt="" fill priority sizes="384px" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-green-950/80 to-transparent" aria-hidden="true" />
                <p className="absolute bottom-3 left-4 right-4 truncate font-display text-lg font-extrabold text-white">{sum?.businessName ?? "Buyurtma"}</p>
              </div>
              <div className="p-5">
                {sum ? (
                  <ul className="divide-y divide-border text-sm">
                    {sum.items.map((i) => (
                      <li key={i.name} className="flex justify-between gap-3 py-2">
                        <span>{i.name} <span className="text-muted-foreground">x {i.qty}</span></span>
                        <span className="tabular-nums">{i.price * i.qty === 0 ? "Bepul" : formatSom(i.price * i.qty)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Buyurtma tafsilotlari bu brauzerda yo&apos;q, summa serverdan olindi.</p>
                )}
                <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                  {discount > 0 && (
                    <>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Oraliq summa</dt><dd className="tabular-nums">{formatSom(subtotal)}</dd></div>
                      <div className="flex justify-between text-green-800"><dt>Chegirma{sum?.discountPct ? ` (${sum.discountPct}%)` : ""}</dt><dd className="tabular-nums">-{formatSom(discount)}</dd></div>
                    </>
                  )}
                  <div className="flex items-end justify-between pt-1"><dt className="font-semibold">Jami</dt><dd className="font-display text-2xl font-extrabold tabular-nums text-green-800">{formatSom(total)}</dd></div>
                </dl>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CircleCheck className="size-3.5 shrink-0 text-green-600" aria-hidden="true" /> TezCheck orqali, faqat kirim</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
