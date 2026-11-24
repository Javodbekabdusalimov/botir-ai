"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setBusinessId, useBusinessId } from "@/hooks/use-business";
import { DEMO_BUSINESSES } from "@/lib/mock";
import { selectClass } from "@/components/field";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Umumiy" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/improve", label: "Yaxshilash" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const id = useBusinessId();
  const known = DEMO_BUSINESSES.some((b) => b.id === id);
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-biz">Biznes paneli</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Agent faoliyati</h1>
        </div>
        <div className="sm:w-64">
          <label htmlFor="biz" className="mb-1 block text-xs text-muted-foreground">
            Biznes
          </label>
          <select id="biz" className={selectClass} value={id} onChange={(e) => setBusinessId(e.target.value)}>
            {DEMO_BUSINESSES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            {!known && <option value={id}>Mening biznesim</option>}
          </select>
        </div>
      </div>
      <nav aria-label="Panel bo'limlari" className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const active = t.href === "/dashboard" ? path === t.href : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm font-medium",
                active ? "border-agent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6">{children}</div>
    </>
  );
}
