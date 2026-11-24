"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass } from "@/components/field";
import { TG_MODES } from "@/components/tg-mode";
import { modeStore, tgPassword, tgSetMode, tgStart, tgVerify } from "@/lib/api";
import type { TgMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "phone" | "code" | "password" | "mode" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "phone", label: "Raqam" },
  { id: "code", label: "SMS kod" },
  { id: "password", label: "2FA" },
  { id: "mode", label: "Rejim" },
];

/** "+998901234567" -> "+998 90 123 45 67"; faqat raqamlar saqlanadi */
function formatPhone(digits: string): string {
  const d = digits.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(" ");
}

export function TelegramConnect() {
  const demo = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot, modeStore.getServerSnapshot);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(""); // 9 raqam, +998 siz
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<TgMode>("copilot");
  const [reqId, setReqId] = useState("");
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
      const r = await tgStart(`+998${phone}`);
      setReqId(r.requestId);
      setStep("code");
    });
  };
  const onCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 5) return setError("5 xonali kodni kiriting");
    void run(async () => {
      const r = await tgVerify(reqId, code);
      setStep(r.status === "need_2fa" ? "password" : "mode");
    });
  };
  const onPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError("Parolni kiriting");
    void run(async () => {
      await tgPassword(reqId, password);
      setPassword("");
      setStep("mode");
    });
  };
  const onMode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await tgSetMode(mode);
      setStep("done");
    });
  };

  const idx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mt-8">
      {step !== "done" && (
        <ol className="mb-6 flex items-center gap-2" aria-label="Qadamlar">
          {STEPS.map((s, i) => (
            <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-1 flex-col gap-1">
              <span className={cn("h-1 rounded-full", i <= idx ? "bg-agent" : "bg-muted")} />
              <span className={cn("text-xs", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {demo && step !== "done" && (
        <p className="mb-4 rounded-xl border border-biz/30 bg-biz/10 p-3 text-xs text-biz">
          Demo rejim: haqiqiy SMS yuborilmaydi, istalgan 5 xonali kod va parol qabul qilinadi.
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        {step === "phone" && (
          <form onSubmit={onPhone} className="space-y-4" noValidate>
            <Field id="phone" label="Telegram raqami" error={error ?? undefined}>
              <div className="flex items-center gap-2">
                <span className="grid h-11 place-items-center rounded-lg border border-input bg-muted px-3 text-base sm:text-sm">+998</span>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" className={inputClass} value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="90 123 45 67" aria-describedby={error ? "phone-err" : undefined} aria-invalid={!!error} />
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
            <Field id="pw" label="Ikki bosqichli parol (2FA)" hint="Telegram'da o'rnatgan bulutli parolingiz. Saqlanmaydi." error={error ?? undefined}>
              <Input id="pw" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "pw-err" : undefined} />
            </Field>
            <Submit busy={busy}>Davom etish</Submit>
          </form>
        )}
        {step === "mode" && (
          <form onSubmit={onMode} className="space-y-4">
            <fieldset>
              <legend className="mb-3 font-display text-lg font-bold">Agent qanday ishlasin?</legend>
              <div className="space-y-2">
                {TG_MODES.map((m) => (
                  <label key={m.id} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:checked]:border-agent has-[:checked]:bg-agent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", "border-border")}>
                    <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-1 size-4 accent-[var(--agent)]" />
                    <span>
                      <span className="block font-medium">{m.label}</span>
                      <span className="block text-sm text-muted-foreground">{m.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Submit busy={busy}>Saqlash</Submit>
          </form>
        )}
        {step === "done" && (
          <div className="space-y-4 text-center" role="status">
            <CheckCircle2 className="mx-auto size-12 text-agent" aria-hidden="true" />
            <p className="font-display text-xl font-bold">Telegram ulandi</p>
            <p className="text-sm text-muted-foreground">Rejim: {TG_MODES.find((m) => m.id === mode)?.label}</p>
            <Link href="/dashboard/inbox" className={cn(buttonVariants(), "h-11 px-5")}>
              Inbox'ga o'tish
            </Link>
          </div>
        )}
      </div>
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
