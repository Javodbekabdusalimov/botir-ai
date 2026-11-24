import { Suspense } from "react";
import { RequireBusiness } from "@/components/require-role";
import { DashboardShell } from "./shell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <RequireBusiness>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:py-10">
        <Suspense fallback={<div className="h-24" />}>
          <DashboardShell>{children}</DashboardShell>
        </Suspense>
      </div>
    </RequireBusiness>
  );
}
