"use client";

import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { modeStore, slowStore } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Sarlavhadagi kichik holat yozuvi:
 * - so'rov 5 s dan oshsa: "Server uyg'onmoqda… (1 daqiqagacha)" (Render bepul tarifi sovuq start);
 * - "Demo" faqat majburiy demo build'da (`NEXT_PUBLIC_DEMO=1`). Server xatosi demoga o'tkazmaydi.
 * Oddiy holatda hech narsa ko'rsatilmaydi.
 */
export function ModeBadge({ className }: { className?: string }) {
  const demo = useSyncExternalStore(modeStore.subscribe, modeStore.getSnapshot, modeStore.getServerSnapshot);
  const slow = useSyncExternalStore(slowStore.subscribe, slowStore.getSnapshot, slowStore.getServerSnapshot);
  if (slow)
    return (
      <span role="status" className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-biz/40 px-2.5 py-1 text-xs font-medium text-biz", className)}>
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="sr-only sm:hidden">Server uyg&apos;onmoqda</span>
        <span className="hidden sm:inline">Server uyg&apos;onmoqda… (1 daqiqagacha)</span>
      </span>
    );
  if (!demo) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-biz/40 px-2.5 py-1 text-xs font-medium text-biz", className)} title="Backend ulanmagan build">
      <span className="size-1.5 rounded-full bg-biz" />
      Demo
    </span>
  );
}
