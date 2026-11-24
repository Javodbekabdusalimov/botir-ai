import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Kirish | Botir AI" };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-md animate-pulse rounded-3xl bg-muted" />}>
      <LoginForm />
    </Suspense>
  );
}
