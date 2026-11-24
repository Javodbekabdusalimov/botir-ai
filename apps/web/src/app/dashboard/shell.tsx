"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, ChevronDown, Clock, Crown, MapPin, MessagesSquare, Send, Sparkles } from "lucide-react";
import { setBusinessId, useBusinessId } from "@/hooks/use-business";
import { useAsync } from "@/hooks/use-async";
import { useAuth } from "@/hooks/use-auth";
import { getBusinesses } from "@/lib/api";
import { ALIAS } from "@/lib/mock";
import { bizPhoto } from "@/lib/photos";
import { CATEGORY_LABEL } from "@/lib/format";
import { BizAvatar } from "@/components/biz-avatar";
import { PlanBar } from "@/components/plan-bar";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Umumiy" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/chat", label: "Agentni sinash" },
  { href: "/dashboard/improve", label: "Yaxshilash" },
];

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function hours(b?: Business) {
  const h = b?.workHours?.[DAYS[new Date().getDay()]] ?? b?.workHours?.mon;
  return h ? `${h[0]}–${h[1]}` : "Yopiq";
}

function BizSelect({ list, current }: { list: Business[]; current?: Business }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white sm:w-60"
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

const glass = "flex h-10 items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-3.5 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const id = useBusinessId();
  const { business } = useAuth();
  const list = useAsync("businesses", getBusinesses);
  const all = list.data ?? [];
  const current = all.find((b) => b.id === id || ALIAS[id] === b.id);
  const name = current?.name ?? business?.name;
  const plan = business?.plan ?? current?.plan ?? "start";
  const compact = path.startsWith("/dashboard/inbox") || path.startsWith("/dashboard/chat");
  return (
    <>
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
          <div className="flex min-w-0 items-center gap-3">
            <BizAvatar id={id} name={name ?? "Biznes"} size={40} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-green-800">Biznes paneli</p>
              <h1 className="truncate font-sans text-lg font-extrabold tracking-tight">{name ?? "Yuklanmoqda..."}</h1>
            </div>
          </div>
          <div className="w-full text-white sm:w-auto [&_button]:border-border [&_button]:bg-muted [&_button]:text-foreground">
            <BizSelect list={all} current={current} />
          </div>
        </div>
      ) : (
        <section className="relative isolate overflow-hidden rounded-3xl bg-green-800 shadow-lift">
          <Image src={bizPhoto(id)} alt="" fill priority sizes="(min-width: 1200px) 1168px, 100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-green-950/85 via-green-800/55 to-emerald-400/10" aria-hidden="true" />
          <div className="flex min-h-[19rem] flex-col justify-between gap-8 p-5 sm:min-h-[20rem] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-bold text-green-900">
                  <span className="size-2 animate-pulse rounded-full bg-green-500 motion-reduce:animate-none" /> Agent faol
                </span>
                <span className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold", plan === "pro" ? "bg-amber-300 text-amber-950" : "bg-white/20 text-white backdrop-blur-md")}>
                  <Crown className="size-3.5" aria-hidden="true" /> {plan === "pro" ? "Pro" : "Start"} tarif
                </span>
              </div>
              <BizSelect list={all} current={current} />
            </div>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <BizAvatar id={id} name={name ?? ""} size={72} className="size-[72px] rounded-2xl ring-4 ring-white/70" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-100">Biznes paneli</p>
                  <h1 className="text-balance font-display text-2xl font-extrabold leading-tight text-white sm:text-4xl">{name ?? <span className="inline-block h-9 w-64 animate-pulse rounded-lg bg-white/20" />}</h1>
                  {current && (
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white">
                      <li className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-md">{CATEGORY_LABEL[current.category] ?? current.category}</li>
                      <li className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-md"><MapPin className="size-3" aria-hidden="true" /> {current.district}</li>
                      <li className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-md"><Clock className="size-3" aria-hidden="true" /> {hours(current)}</li>
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/chat" className={cn(glass, "bg-white text-green-900 hover:bg-white/90")}>
                  <Sparkles className="size-4" aria-hidden="true" /> Agentni sinash
                </Link>
                <Link href="/connect" className={glass}>
                  <BookOpen className="size-4" aria-hidden="true" /> Katalog
                </Link>
                <Link href="/connect/telegram" className={glass}>
                  <Send className="size-4" aria-hidden="true" /> Telegram
                </Link>
              </div>
            </div>
          </div>
        </section>
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
