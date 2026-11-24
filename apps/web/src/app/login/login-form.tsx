"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, FlaskConical, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Field, inputClass } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginUser, useAuth } from "@/hooks/use-auth";
import { maskPhone } from "@/lib/phone";
import { TEST_ACCOUNTS } from "@/lib/mock";
import { ApiError } from "@/lib/api";

export function landingFor(role: string) {
  return role === "business" ? "/dashboard" : "/assistant";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { status, user } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "in" && user) router.replace(next && next.startsWith("/") ? next : landingFor(user.role));
  }, [status, user, next, router]);

  async function submit(p: string, pw: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginUser(p, pw);
    } catch (e) {
      setError(e instanceof ApiError && e.message ? "Telefon yoki parol noto'g'ri" : "Ulanib bo'lmadi. Qayta urinib ko'ring");
      setBusy(false);
    }
  }

  const fill = (acc: { phone: string; password: string }) => {
    const p = maskPhone(acc.phone);
    setPhone(p);
    setPassword(acc.password);
    void submit(acc.phone, acc.password);
  };

  return (
    <AuthShell title="Kirish" subtitle="Telefon raqam va parol bilan akkauntingizga kiring.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("+" + phone.replace(/\D/g, ""), password);
        }}
        className="space-y-4"
        noValidate
      >
        <PhoneField value={phone} onChange={setPhone} />
        <Field id="password" label="Parol">
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              className={`${inputClass} pr-12`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={busy || !phone || !password}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Kirilmoqda..." : "Kirish"}
        </Button>
      </form>

      <section aria-label="Test akkauntlar" className="mt-6 rounded-2xl border border-tint-3 bg-tint-1 p-4">
        <h2 className="flex items-center gap-2 font-sans text-sm font-bold text-green-900">
          <FlaskConical className="size-4" aria-hidden="true" /> Test akkaunt bilan kirish
        </h2>
        <p className="mt-1 text-xs text-green-900/80">Jyuri uchun: bir bosishda to&apos;ldiriladi va kiradi.</p>
        <div className="mt-3 grid gap-2">
          {(
            [
              ["Biznes: Chilonzor Osh Markazi", TEST_ACCOUNTS.business],
              ["Mijoz", TEST_ACCOUNTS.user],
            ] as const
          ).map(([label, acc]) => (
            <button
              key={acc.phone}
              type="button"
              disabled={busy}
              onClick={() => fill(acc)}
              className="min-h-14 rounded-xl border border-tint-3 bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-white focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {maskPhone(acc.phone)} / {acc.password}
              </span>
            </button>
          ))}
        </div>
      </section>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Akkauntingiz yo&apos;qmi?{" "}
        <Link href="/register" className="font-semibold text-green-700 underline-offset-4 hover:underline">
          Ro&apos;yxatdan o&apos;ting
        </Link>
      </p>
    </AuthShell>
  );
}
