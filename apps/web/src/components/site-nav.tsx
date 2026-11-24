"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home, LayoutDashboard, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { ModeBadge } from "./mode-badge";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Bosh", icon: Home },
  { href: "/connect", label: "Biznes", icon: Building2 },
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/assistant", label: "Yordamchi", icon: Sparkles },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Asosiy" className="hidden items-center gap-1 sm:flex">
          {LINKS.slice(1).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive(path, l.href) && "text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
          <ModeBadge className="ml-2" />
        </nav>
        <ModeBadge className="sm:hidden" />
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Mobil"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {LINKS.map((l) => {
        const Icon = l.icon;
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
              active && "text-agent",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
