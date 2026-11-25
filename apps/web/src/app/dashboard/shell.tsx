"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, MessagesSquare } from "lucide-react";
import { setBusinessId, useBusinessId } from "@/hooks/use-business";
import { useAsync } from "@/hooks/use-async";
import { useAuth } from "@/hooks/use-auth";
import { getBusinesses } from "@/lib/api";
import { ALIAS } from "@/lib/mock";
import { BizAvatar } from "@/components/biz-avatar";
import { PlanBar } from "@/components/plan-bar";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Umumiy" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/knowledge", label: "Bilimlar" },
  { href: "/dashboard/chat", label: "Agentni sinash" },
  { href: "/dashboard/improve", label: "Yaxshilash" },
];

function BizSelect({ list, current }: { list: Business[]; current?: Business }) {
  const [open, setOpen] = useState(false);
  // Egasi faqat o'z biznesini ko'radi (API boshqasiga 403 beradi): tanlov kerak emas.
  if (list.length <= 1) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white sm:w-60"
      >
        <span className="min-w-0 flex-1 truncate text-left">{current?.name ?? "Biznesni tanlang"}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" className="slide-up absolute right-0 z-30 mt-2 w-full min-w-60 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-lift">
          {list.map((b) => (
            <li key={b.id} role="option" aria-selected={b.id === current?.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setBusinessId(b.id);
                  setOpen(false);
                }}
                className={cn("flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm font-medium hover:bg-tint-1", b.id === current?.id && "bg-tint-1 text-green-900")}
              >
                <BizAvatar id={b.id} name="" size={28} />
                <span className="truncate">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const id = useBusinessId();
  const { business, user } = useAuth();
  const own = user?.role === "business" ? user.businessId : null;
  const list = useAsync("businesses", getBusinesses);
  // Kirgan biznes egasi: faqat o'z biznesi (boshqasini tanlasa API 403). Mehmon/demo: hamma namuna biznes.
  const all = (list.data ?? []).filter((b) => !own || b.id === own || ALIAS[own] === b.id);
  useEffect(() => {
    if (own && id !== own) setBusinessId(own);
  }, [own, id]);
  const current = all.find((b) => b.id === id || ALIAS[id] === b.id);
  const name = current?.name ?? business?.name;
  return (
    <>
      {path === "/dashboard" ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-card p-3 shadow-soft">
          <div className="flex min-w-0 items-center gap-3">
            <BizAvatar id={id} name={name ?? "Biznes"} size={40} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-green-800">Biznes paneli</p>
              <h1 className="truncate font-sans text-lg font-bold tracking-tight">{name ?? "Yuklanmoqda..."}</h1>
            </div>
          </div>
          <div className="w-full text-white sm:w-auto [&_button]:border-border [&_button]:bg-muted [&_button]:text-foreground">
            <BizSelect list={all} current={current} />
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
                "flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 text-sm font-semibold",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.href === "/dashboard/chat" && <MessagesSquare className="size-4" aria-hidden="true" />}
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6">{children}</div>
    </>
  );
}
