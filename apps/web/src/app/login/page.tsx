import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Kirish", description: "Life Assistant hisobingizga telefon raqam va parol bilan kiring: buyurtmalar, muzokaralar va biznes paneli bir joyda.", path: "/login", noindex: true });

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-md animate-pulse rounded-2xl bg-muted" />}>
      <LoginForm />
    </Suspense>
  );
}
