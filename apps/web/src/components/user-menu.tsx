"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";
import { logoutUser, useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "B";

/** Ixcham foydalanuvchi menyusi: avatar + ism + rol, dropdown ichida Panel / Sozlamalar / Chiqish. */
export function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!user) return null;
  const biz = user.role === "business";
  const item = "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-foreground hover:bg-tint-1 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 shadow-sm transition-colors hover:bg-tint-1 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="grid size-8 place-items-center rounded-full bg-green-600 text-xs font-bold text-white">{initials(user.name)}</span>
        <span className="hidden min-w-0 max-w-[9.5rem] truncate text-sm font-semibold lg:block">{user.name}</span>
        <span className="hidden rounded-full bg-tint-2 px-2 py-0.5 text-[11px] font-semibold text-green-900 sm:block">{biz ? "Biznes" : "Mijoz"}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="slide-up absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-lift">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.phone}</p>
          </div>
          <div className="border-t border-border pt-1.5">
            <Link role="menuitem" href={biz ? "/dashboard" : "/assistant"} onClick={() => setOpen(false)} className={item}>
              {biz ? <LayoutDashboard className="size-4 text-green-700" aria-hidden="true" /> : <Sparkles className="size-4 text-green-700" aria-hidden="true" />}
              {biz ? "Panel" : "Yordamchi"}
            </Link>
            <Link role="menuitem" href={biz ? "/connect" : "/me/telegram"} onClick={() => setOpen(false)} className={item}>
              <Settings className="size-4 text-green-700" aria-hidden="true" /> Sozlamalar
            </Link>
            <button
              type="button"
              role="menuitem"
              className={cn(item, "text-destructive")}
              onClick={() => {
                setOpen(false);
                logoutUser();
                router.push("/");
              }}
            >
              <LogOut className="size-4" aria-hidden="true" /> Chiqish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
