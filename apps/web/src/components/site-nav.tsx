"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Building2, Home, Inbox, LayoutDashboard, Send, Sparkles } from "lucide-react";
import { usePendingActions } from "@/hooks/use-pending-actions";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";
import { ModeBadge } from "./mode-badge";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: typeof Home; badge?: boolean };
const HOME: NavLink = { href: "/", label: "Bosh", icon: Home };
const BUSINESS_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/connect/telegram", label: "Telegram", icon: Send },
  { href: "/dashboard/knowledge", label: "Katalog", icon: Building2 },
];
const CLIENT_LINKS: NavLink[] = [
  { href: "/assistant", label: "Yordamchi", icon: Sparkles },
  { href: "/me/telegram", label: "Telegram", icon: Send },
  { href: "/me/actions", label: "Amallar", icon: BellRing, badge: true },
];
const GUEST_LINKS: NavLink[] = [
  { href: "/assistant", label: "Yordamchi", icon: Sparkles },
  { href: "/connect", label: "Biznes uchun", icon: Building2 },
];

function useNav(): NavLink[] {
  const { user } = useAuth();
  return user?.role === "business" ? BUSINESS_LINKS : user?.role === "user" ? CLIENT_LINKS : GUEST_LINKS;
}

function isActive(path: string, href: string) {
  return ["/", "/dashboard", "/connect"].includes(href) ? path === href : path.startsWith(href);
}

function AuthArea() {
  const { status, user } = useAuth();
  if (status === "loading") return <div className="h-10 w-24" aria-hidden="true" />;
  if (!user)
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-green-900 transition-colors hover:bg-white/50">
          Kirish
        </Link>
        <Link href="/register" className="rounded-full bg-green-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-950">
          <span className="sm:hidden">Boshlash</span>
          <span className="hidden sm:inline">Ro&apos;yxatdan o&apos;tish</span>
        </Link>
      </div>
    );
  return <UserMenu />;
}

function PendingDot({ n }: { n: number }) {
  return (
    <span className="ml-1.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white" aria-label={`${n} ta kutilayotgan amal`}>
      {n}
    </span>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const { user } = useAuth();
  const links = useNav();
  const pending = usePendingActions(user?.role === "user", path);
  const isBiz = user?.role === "business";
  return (
    // Nestive uslubi: shaffof bitta qator — chapda logo, markazda nuqta bilan ajratilgan bo'limlar, o'ngda kirish
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/35 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Asosiy" className="hidden items-center sm:flex">
          {links.map((l, i) => {
            const active = isActive(path, l.href);
            return (
              <span key={l.href} className="flex items-center">
                {i > 0 && <span className="mx-2 size-1 rounded-full bg-green-800/40" aria-hidden="true" />}
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center rounded-full px-3 text-sm text-green-900/75 transition-colors hover:text-green-950",
                    active && "bg-white/60 font-semibold text-green-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]",
                  )}
                >
                  {l.label}
                  {l.badge && pending > 0 && <PendingDot n={pending} />}
                </Link>
              </span>
            );
          })}
          {!isBiz && (
            <span className="flex items-center">
              <span className="mx-2 size-1 rounded-full bg-green-800/40" aria-hidden="true" />
              <Link href="/narxlar" className="flex h-9 items-center rounded-full px-3 text-sm text-green-900/75 transition-colors hover:text-green-950">
                Narxlar
              </Link>
            </span>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <ModeBadge className="px-2 text-[11px]" />
          <AuthArea />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  const { user } = useAuth();
  const links = [HOME, ...useNav()].slice(0, 5);
  const pending = usePendingActions(user?.role === "user", path);
  return (
    <nav
      aria-label="Mobil"
      style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-white/50 bg-white/55 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      {links.map((l) => {
        const Icon = l.icon;
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground", active && "font-semibold text-green-950")}
          >
            <Icon className="size-5" aria-hidden="true" />
            {l.label}
            {l.badge && pending > 0 && (
              <span className="absolute right-[22%] top-1.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
