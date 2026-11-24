"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setBusinessId, useBusinessId } from "@/hooks/use-business";
import { DEMO_BUSINESSES } from "@/lib/mock";
import { bizPhoto } from "@/lib/photos";
import { CATEGORY_LABEL } from "@/lib/format";
import { selectClass } from "@/components/field";
import { BizAvatar } from "@/components/biz-avatar";
import { PlanBar } from "@/components/plan-bar";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Umumiy" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/improve", label: "Yaxshilash" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const id = useBusinessId();
  const compact = path.startsWith("/dashboard/inbox");
  const current = DEMO_BUSINESSES.find((b) => b.id === id);
  const known = !!current;
  return (
    <>
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BizAvatar id={id} name={current?.name ?? "Biznes"} size={44} />
            <div>
              <p className="text-xs font-semibold text-green-800">Biznes paneli</p>
              <h1 className="text-xl font-bold sm:text-2xl">{current?.name ?? "Mening biznesim"}</h1>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <label htmlFor="biz" className="sr-only">
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
      ) : (
      <div className="relative overflow-hidden rounded-3xl bg-green-900 shadow-soft">
        <Image src={bizPhoto(id)} alt="" fill priority sizes="(min-width: 1200px) 1200px, 100vw" className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-green-950/90 via-green-950/60 to-transparent" aria-hidden="true" />
        <div className="relative flex min-h-40 flex-col justify-end gap-4 p-5 sm:min-h-48 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-semibold text-green-200">Biznes paneli{current ? ` · ${CATEGORY_LABEL[current.category] ?? ""}` : ""}</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-4xl">{current?.name ?? "Mening biznesim"}</h1>
          </div>
          <div className="sm:w-64">
            <label htmlFor="biz" className="mb-1 block text-xs font-medium text-green-100">
              Biznes
            </label>
            <select id="biz" className={cn(selectClass, "border-white/30 bg-white/95")} value={id} onChange={(e) => setBusinessId(e.target.value)}>
              {DEMO_BUSINESSES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              {!known && <option value={id}>Mening biznesim</option>}
            </select>
          </div>
        </div>
      </div>
      )}
      <PlanBar />
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
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
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
