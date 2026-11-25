"use client";

import { track } from "@/lib/track";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Building2, Check, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Field, inputClass } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerUser } from "@/hooks/use-auth";
import { isPhoneComplete, phoneDigits } from "@/lib/phone";
import { ApiError } from "@/lib/api";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES = [
  { role: "business" as const, icon: Building2, title: "Men biznesman", text: "Katalog yuklayman, agent mijozlar bilan gaplashadi." },
  { role: "user" as const, icon: Bot, title: "Men mijozman", text: "Shaxsiy agent mening o'rnimga narx kelishadi." },
];

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !role) return;
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = "Ismingizni kiriting";
    if (!isPhoneComplete(phone)) errs.phone = "Telefon raqamni to'liq kiriting: +998 XX XXX XX XX";
    if (password.length < 6) errs.password = "Parol kamida 6 ta belgi bo'lsin";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await registerUser({ name: name.trim(), phone: phoneDigits(phone), password, role });
      track("sign_up", { method: "phone", role });
      router.push(role === "business" ? "/connect" : "/assistant");
    } catch (e) {
      setFormError(e instanceof ApiError && e.message ? e.message : "Ro'yxatdan o'tib bo'lmadi. Qayta urinib ko'ring");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={step === 1 ? "Kim sifatida kirasiz?" : "Ma'lumotlaringiz"}
      subtitle={step === 1 ? "Rolni tanlang. Keyin o'zgartirib bo'lmaydi." : role === "business" ? "Biznes akkaunti: keyingi qadamda biznesingizni ulaysiz." : "Mijoz akkaunti: keyingi qadamda yordamchi ochiladi."}
    >
      <p className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground" aria-live="polite">
        <span className="flex gap-1" aria-hidden="true">
          {[1, 2].map((n) => (
            <span key={n} className={cn("h-1.5 w-8 rounded-full", n <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </span>
        {step}-qadam / 2
      </p>

      {step === 1 ? (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Rol" className="grid gap-3">
            {ROLES.map(({ role: r, icon: Icon, title, text }) => {
              const on = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex min-h-24 items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring",
                    on ? "border-primary bg-tint-1 shadow-soft" : "border-border bg-card hover:border-tint-3",
                  )}
                >
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", on ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-bold">{title}</span>
                    <span className="block text-sm text-muted-foreground">{text}</span>
                  </span>
                  {on && <Check className="size-5 shrink-0 text-green-700" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <Button size="lg" className="h-12 w-full text-base font-semibold" disabled={!role} onClick={() => setStep(2)}>
            Davom etish
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field id="name" label={role === "business" ? "Ism yoki biznes nomi" : "Ismingiz"} error={errors.name}>
            <Input id="name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} />
          </Field>
          <PhoneField value={phone} onChange={setPhone} error={errors.phone} />
          <Field id="password" label="Parol" hint="Kamida 6 ta belgi" error={errors.password}>
            <Input id="password" type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-err" : undefined} />
          </Field>
          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" className="h-12 px-4" onClick={() => setStep(1)} disabled={busy}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Orqaga
            </Button>
            <Button type="submit" size="lg" className="h-12 flex-1 text-base font-semibold" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? "Yaratilmoqda..." : "Akkaunt yaratish"}
            </Button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Akkauntingiz bormi?{" "}
        <Link href="/login" className="font-semibold text-green-700 underline-offset-4 hover:underline">
          Kirish
        </Link>
      </p>
    </AuthShell>
  );
}
