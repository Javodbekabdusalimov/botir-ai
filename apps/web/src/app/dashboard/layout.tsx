import { Suspense } from "react";
import { DashboardShell } from "./shell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <Suspense fallback={<div className="h-24" />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </div>
  );
}
