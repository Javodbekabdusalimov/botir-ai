"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BadgeCheck, CheckCircle2, Loader2, LockKeyhole, Unplug } from "lucide-react";
import { BrandLogo } from "@/components/brand-logos";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass } from "@/components/field";
import { CHAT_MODES } from "@/components/tg-mode";
import { useBusinessId } from "@/hooks/use-business";
import { modeStore, tgCode, tgDisconnect, tgStart } from "@/lib/api";
import { cn } from "@/lib/utils";

type Method = "business" | "account";
type Step = "choose" | "phone" | "code" | "password" | "connected";
const FLOW: { id: Step; label: string }[] = [
  { id: "choose", label: "Usul" },
  { id: "phone", label: "Raqam" },
  { id: "code", label: "SMS kod" },
  { id: "password", label: "2FA" },
];

const connKey = (id: string) => `botir.tg.${id}`;
const connSubs = new Set<() => void>();
const readConn = (id: string) => {
  try {
    return localStorage.getItem(connKey(id)) === "1";
  } catch {
    return false;
  }
};
const writeConn = (id: string, v: boolean) => {
  try {
    if (v) localStorage.setItem(connKey(id), "1");
    else localStorage.removeItem(connKey(id));
  } catch {}
  connSubs.forEach((f) => f());
};
const subscribeConn = (cb: () => void) => {
  connSubs.add(cb);
  return () => void connSubs.delete(cb);
};

/** 9 raqam -> "90 123 45 67" */
function formatPhone(digits: string): string {
  const d = digits.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}

export function TelegramConnect() {
  const businessId = useBusinessId();
  const demo = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot, modeStore.getServerSnapshot);
  const connected = useSyncExternalStore(subscribeConn, () => readConn(businessId), () => false);
  const [method, setMethod] = useState<Method>("account");
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik, qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  }

  const onPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 9) return setError("Raqamni to'liq kiriting: +998 XX XXX XX XX");
    void run(async () => {
      const r = await tgStart(businessId, `+998${phone}`);
      setLoginId(r.loginId);
      setStep("code");
    });
  };

  const submitCode = (withPassword?: string) =>
    run(async () => {
      const r = await tgCode(loginId, code, withPassword);
      if (r.status === "connected") {
        setPassword("");
        writeConn(businessId, true);
        setStep("connected");
      } else if (r.status === "need_password") setStep("password");
      else if (r.status === "invalid_code") {
        setStep("code");
        setError("Kod noto'g'ri. Qayta kiriting.");
      } else setError("Ulab bo'lmadi. Raqamni tekshirib, qayta urinib ko'ring.");
    });

  const onCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 5) return setError("5 xonali kodni kiriting");
    void submitCode();
  };
  const onPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError("Parolni kiriting");
    void submitCode(password);
  };

  const onDisconnect = () =>
    run(async () => {
      await tgDisconnect(businessId);
      writeConn(businessId, false);
      setStep("choose");
      setPhone("");
      setCode("");
    });

  const idx = FLOW.findIndex((s) => s.id === step);
  const isConnected = connected || step === "connected";

  return (
    <div className="mt-8">
      {demo && !isConnected && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-biz-soft p-3 text-xs text-biz">
          Demo rejim: haqiqiy SMS yuborilmaydi, istalgan 5 xonali kod qabul qilinadi (keyin 2FA so'raladi).
        </p>
      )}

      <p className="mb-4 flex items-start gap-2 rounded-xl border border-tint-3 bg-tint-1 p-3 text-xs text-green-900">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Sessiya shifrlangan holda saqlanadi, parolingiz saqlanmaydi. Istalgan payt [Uzish] tugmasi bilan ulanishni to&apos;xtatasiz.</span>
      </p>

      {isConnected ? (
        <div className="space-y-4 rounded-2xl border border-green-500/40 bg-tint-1 p-5" role="status">
          <p className="flex items-center gap-2 font-display text-xl font-bold text-green-800">
            <CheckCircle2 className="size-6" aria-hidden="true" /> Telegram ulangan
          </p>
          <p className="text-sm text-muted-foreground">
            Mijozlar yozishmalari Inbox'ga tushadi. Rejim har bir chat uchun alohida tanlanadi:
          </p>
          <ul className="space-y-1.5 text-sm">
            {CHAT_MODES.map((m) => (
              <li key={m.id}>
                <span className={cn("mr-2 rounded-full px-2 py-0.5 text-xs font-semibold", m.cls)}>{m.label}</span>
                <span className="text-muted-foreground">{m.desc}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/inbox" className={cn(buttonVariants(), "h-11 px-5")}>
              Inbox'ga o'tish
            </Link>
            <Button variant="outline" className="h-11 px-4" onClick={onDisconnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Unplug className="size-4" aria-hidden="true" />}
              Uzish
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ol className="mb-6 flex items-center gap-2" aria-label="Qadamlar">
                {FLOW.map((s, i) => (
                  <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-1 flex-col gap-1">
                    <span className={cn("h-1 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
                    <span className={cn("text-xs", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  </li>
                ))}
              </ol>
          {step === "choose" && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold">Ulash usulini tanlang</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { id: "business", title: "Telegram Business", tag: "Premium, rasmiy", desc: "Sozlamalar, Telegram Business, Chatbotlar bo'limida Life Assistant botini tanlaysiz." },
                    { id: "account", title: "Akkaunt ulash", tag: "Premium shart emas", desc: "Telefon raqam, SMS kod va (bo'lsa) 2FA paroli orqali." },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={method === o.id}
                    onClick={() => setMethod(o.id)}
                    className={cn(
                      "flex h-full flex-col rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring",
                      method === o.id ? "border-primary bg-tint-1 shadow-lift" : "border-border bg-card shadow-soft",
                    )}
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-border">
                      <BrandLogo brand="telegram" height={24} />
                    </span>
                    <span className="mt-3 font-display text-base font-bold">{o.title}</span>
                    <span className="mt-1 w-fit rounded-full bg-tint-2 px-2 py-0.5 text-xs font-semibold text-green-900">{o.tag}</span>
                    <span className="mt-2 text-sm text-muted-foreground">{o.desc}</span>
                  </button>
                ))}
              </div>
              {method === "business" ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <BadgeCheck className="size-4 text-green-700" aria-hidden="true" /> Bot ulanganda chatlar avtomatik Inbox&apos;ga tushadi
                  </p>
                  <p className="mt-2 text-muted-foreground">Ulagach, bu sahifani yangilang. Agar ulanmasa, akkaunt orqali ulang.</p>
                  <Button className="mt-3 h-11 px-4" variant="outline" onClick={() => setMethod("account")}>
                    Akkaunt orqali ulash
                  </Button>
                </div>
              ) : (
                <Button size="lg" className="h-12 w-full text-base font-semibold" onClick={() => setStep("phone")}>
                  Davom etish
                </Button>
              )}
            </div>
          )}

          {step !== "choose" && (
            <>
              <div className="rounded-2xl border border-border bg-card shadow-soft p-4 sm:p-6">
                {step === "phone" && (
                  <form onSubmit={onPhone} className="space-y-4" noValidate>
                    <Field id="phone" label="Telegram raqami" error={error ?? undefined}>
                      <div className="flex items-center gap-2">
                        <span className="grid h-11 place-items-center rounded-lg border border-input bg-muted px-3 text-base sm:text-sm">+998</span>
                        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" className={inputClass} value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="90 123 45 67" aria-invalid={!!error} aria-describedby={error ? "phone-err" : undefined} />
                      </div>
                    </Field>
                    <Submit busy={busy}>Kod yuborish</Submit>
                  </form>
                )}
                {step === "code" && (
                  <form onSubmit={onCode} className="space-y-4" noValidate>
                    <Field id="code" label="Telegram'dan kelgan kod" hint={`+998 ${formatPhone(phone)} raqamiga yuborildi`} error={error ?? undefined}>
                      <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={cn(inputClass, "tracking-[0.4em]")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={!!error} aria-describedby={error ? "code-err" : undefined} />
                    </Field>
                    <Submit busy={busy}>Tasdiqlash</Submit>
                  </form>
                )}
                {step === "password" && (
                  <form onSubmit={onPassword} className="space-y-4" noValidate>
                    <Field id="pw" label="Ikki bosqichli parol (2FA)" hint="Telegram'da o'rnatgan bulutli parolingiz. Sessiya shifrlanib saqlanadi, parol saqlanmaydi." error={error ?? undefined}>
                      <Input id="pw" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "pw-err" : undefined} />
                    </Field>
                    <Submit busy={busy}>Ulash</Submit>
                  </form>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
