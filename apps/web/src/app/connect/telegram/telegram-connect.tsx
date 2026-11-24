"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BadgeCheck, CheckCircle2, Loader2, Unplug } from "lucide-react";
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
        <p className="mb-4 rounded-xl border border-biz/30 bg-biz/10 p-3 text-xs text-biz">
          Demo rejim: haqiqiy SMS yuborilmaydi, istalgan 5 xonali kod qabul qilinadi (keyin 2FA so'raladi).
        </p>
      )}

      {isConnected ? (
        <div className="space-y-4 rounded-2xl border border-agent/40 bg-agent/10 p-5" role="status">
          <p className="flex items-center gap-2 font-display text-xl font-bold text-agent">
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
          {step === "choose" && (
            <fieldset className="space-y-3">
              <legend className="mb-3 font-display text-lg font-bold">Ulash usulini tanlang</legend>
              {(
                [
                  { id: "business", title: "A. Telegram Business (Premium)", desc: "Telegram Premium kerak. Sozlamalar, Telegram Business, Chatbotlar bo'limida Botir AI botini tanlaysiz." },
                  { id: "account", title: "B. Akkaunt orqali", desc: "Telefon raqam, SMS kod va (bo'lsa) 2FA paroli. Premium shart emas." },
                ] as const
              ).map((o) => (
                <label key={o.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-agent has-[:checked]:bg-agent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <input type="radio" name="method" value={o.id} checked={method === o.id} onChange={() => setMethod(o.id)} className="mt-1 size-4 accent-[var(--agent)]" />
                  <span>
                    <span className="block font-medium">{o.title}</span>
                    <span className="block text-sm text-muted-foreground">{o.desc}</span>
                  </span>
                </label>
              ))}
              {method === "business" ? (
                <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <BadgeCheck className="size-4 text-agent" aria-hidden="true" /> Bot ulanganda chatlar avtomatik Inbox'ga tushadi
                  </p>
                  <p className="mt-2 text-muted-foreground">Ulagach, bu sahifani yangilang. Agar ulanmasa, B usulidan foydalaning.</p>
                  <Button className="mt-3 h-11 px-4" variant="outline" onClick={() => setMethod("account")}>
                    B usuliga o'tish
                  </Button>
                </div>
              ) : (
                <Button size="lg" className="h-12 w-full text-base" onClick={() => setStep("phone")}>
                  Davom etish
                </Button>
              )}
            </fieldset>
          )}

          {step !== "choose" && (
            <>
              <ol className="mb-6 flex items-center gap-2" aria-label="Qadamlar">
                {FLOW.map((s, i) => (
                  <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-1 flex-col gap-1">
                    <span className={cn("h-1 rounded-full", i <= idx ? "bg-agent" : "bg-muted")} />
                    <span className={cn("text-xs", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
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
