"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2, LockKeyhole, Unplug } from "lucide-react";
import { BrandLogo } from "@/components/brand-logos";
import { Field, inputClass } from "@/components/field";
import { ErrorBox, Loading } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsync } from "@/hooks/use-async";
import { meTgCode, meTgDisconnect, meTgStart, meTgStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "phone" | "code" | "password";
const FLOW: { id: Step; label: string }[] = [
  { id: "phone", label: "Raqam" },
  { id: "code", label: "SMS kod" },
  { id: "password", label: "2FA" },
];
const fmt = (d: string) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");

export function MeTelegram() {
  const st = useAsync("me-tg", meTgStatus);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
  const submitCode = (pw?: string) =>
    run(async () => {
      const r = await meTgCode(loginId, code, pw);
      if (r.status === "connected") {
        setDone(true);
        st.reload();
      } else if (r.status === "need_password") setStep("password");
      else if (r.status === "invalid_code") {
        setStep("code");
        setError("Kod noto'g'ri. Qayta kiriting.");
      } else setError("Ulab bo'lmadi. Raqamni tekshirib, qayta urinib ko'ring.");
    });

  if (st.loading) return <div className="mt-8"><Loading /></div>;
  if (st.error || !st.data) return <div className="mt-8"><ErrorBox message={st.error ?? "Holatni olib bo'lmadi"} onRetry={st.reload} /></div>;

  if (!st.data.available)
    return (
      <p role="status" className="mt-8 rounded-2xl border border-amber-200 bg-biz-soft p-4 text-sm text-biz">
        Telegram ulash hozircha serverda yoqilmagan. Keyinroq qayta urinib ko&apos;ring.
      </p>
    );

  if (st.data.connected || done)
    return (
      <div className="slide-up mt-8 space-y-4 rounded-2xl border border-green-500/40 bg-tint-1 p-5 shadow-soft sm:p-6" role="status">
        <p className="flex items-center gap-2 font-display text-2xl font-bold text-green-900">
          <CheckCircle2 className="size-7 text-green-600" aria-hidden="true" /> Ulandi ✅
        </p>
        {st.data.username && <p className="text-sm text-green-900/80">Akkaunt: @{st.data.username}</p>}
        <p className="rounded-2xl border border-tint-3 bg-card p-4 text-[15px] leading-relaxed shadow-sm">
          Endi Telegramdagi <strong>Saqlangan xabarlar</strong>ga <span className="rounded-md bg-tint-2 px-1.5 font-semibold">&quot;Botir, ...&quot;</span> deb yozing.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/me/actions" className={cn(buttonVariants(), "h-12 px-5 font-semibold")}>
            Amallarni ko&apos;rish
          </Link>
          <Button
            variant="outline"
            className="h-12 px-4"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await meTgDisconnect();
                setDone(false);
                setStep("phone");
                setPhone("");
                setCode("");
                st.reload();
              })
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Unplug className="size-4" aria-hidden="true" />} Uzish
          </Button>
        </div>
      </div>
    );

  const idx = FLOW.findIndex((s) => s.id === step);
  return (
    <div className="mt-8">
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-tint-3 bg-tint-1 p-3 text-xs text-green-900">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Sessiya shifrlangan holda saqlanadi, parolingiz saqlanmaydi. Istalgan payt [Uzish] bilan to&apos;xtatasiz.</span>
      </p>
      <ol className="mb-5 flex items-center gap-2" aria-label="Qadamlar">
        {FLOW.map((s, i) => (
          <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-1 flex-col gap-1">
            <span className={cn("h-1 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-xs", i === idx ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-border">
            <BrandLogo brand="telegram" height={24} />
          </span>
          <h2 className="font-display text-lg font-bold">Telegram akkaunt</h2>
        </div>
        {step === "phone" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (phone.length !== 9) return setError("Raqamni to'liq kiriting: +998 XX XXX XX XX");
              void run(async () => {
                const r = await meTgStart(`+998${phone}`);
                setLoginId(r.loginId);
                setStep("code");
              });
            }}
          >
            <Field id="mphone" label="Telegram raqami" error={error ?? undefined}>
              <div className="flex items-center gap-2">
                <span className="grid h-11 place-items-center rounded-lg border border-input bg-muted px-3 text-base sm:text-sm">+998</span>
                <Input id="mphone" type="tel" inputMode="tel" autoComplete="tel-national" className={inputClass} value={fmt(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="90 123 45 67" aria-invalid={!!error} aria-describedby={error ? "mphone-err" : undefined} />
              </div>
            </Field>
            <Submit busy={busy}>Kod yuborish</Submit>
          </form>
        )}
        {step === "code" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length < 5) return setError("5 xonali kodni kiriting");
              void submitCode();
            }}
          >
            <Field id="mcode" label="Telegram'dan kelgan kod" hint={`+998 ${fmt(phone)} raqamiga yuborildi`} error={error ?? undefined}>
              <Input id="mcode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={cn(inputClass, "tracking-[0.4em]")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={!!error} aria-describedby={error ? "mcode-err" : undefined} />
            </Field>
            <Submit busy={busy}>Tasdiqlash</Submit>
          </form>
        )}
        {step === "password" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!password) return setError("Parolni kiriting");
              void submitCode(password);
            }}
          >
            <Field id="mpw" label="Ikki bosqichli parol (2FA)" hint="Telegram'da o'rnatgan bulutli parolingiz." error={error ?? undefined}>
              <Input id="mpw" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "mpw-err" : undefined} />
            </Field>
            <Submit busy={busy}>Ulash</Submit>
          </form>
        )}
      </div>
    </div>
  );
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={busy}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
