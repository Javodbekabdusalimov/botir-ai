"use client";

import { useSyncExternalStore } from "react";
import { modeStore } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ModeBadge({ className }: { className?: string }) {
  const demo = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot, modeStore.getServerSnapshot);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        demo ? "border-biz/40 text-biz" : "border-agent/40 text-agent",
        className,
      )}
      title={demo ? "Backend ulanmagan: skriptli demo ma'lumotlar" : "Backend bilan ulangan"}
    >
      <span className={cn("size-1.5 rounded-full", demo ? "bg-biz" : "bg-agent")} />
      {demo ? "Demo" : "Jonli"}
    </span>
  );
}
