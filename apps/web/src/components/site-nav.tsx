"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Building2, Home, Inbox, LayoutDashboard, Send, Sparkles } from "lucide-react";
import { usePendingActions } from "@/hooks/use-pending-actions";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";
import { ModeBadge } from "./mode-badge";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: typeof Home; badge?: boolean };
const HOME: NavLink = { href: "/", label: "Bosh", icon: Home };
const BUSINESS_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/connect/telegram", label: "Telegram", icon: Send },
  { href: "/connect", label: "Biznes", icon: Building2 },
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
        <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-2.5 text-sm sm:px-3")}>
          Kirish
        </Link>
        <Link href="/register" className={cn(buttonVariants(), "h-10 px-3 text-sm font-semibold shadow-sm sm:px-4")}>
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
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-white/70 shadow-[0_1px_0_rgb(255_255_255/0.8)_inset] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4">
        <Logo />
        <nav aria-label="Asosiy" className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className={cn(
                "flex h-10 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-tint-1 hover:text-foreground",
                isActive(path, l.href) && "bg-tint-2/70 text-green-900",
              )}
            >
              {l.label}
              {l.badge && pending > 0 && <PendingDot n={pending} />}
            </Link>
          ))}
          <ModeBadge className="ml-2" />
        </nav>
        <div className="flex items-center gap-2">
          <ModeBadge className="px-2 text-[11px] sm:hidden" />
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
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {links.map((l) => {
        const Icon = l.icon;
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground", active && "text-green-800")}
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
