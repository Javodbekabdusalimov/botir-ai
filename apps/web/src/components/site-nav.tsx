"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home, LayoutDashboard, LogOut, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { ModeBadge } from "./mode-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { logoutUser, useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
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

const ROLE_LABEL = { business: "Biznes", user: "Mijoz" } as const;

function AuthArea() {
  const { status, user } = useAuth();
  const router = useRouter();
  if (status === "loading") return <div className="h-11 w-24" aria-hidden="true" />;
  if (!user)
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-3 text-sm")}>
          Kirish
        </Link>
        <Link href="/register" className={cn(buttonVariants(), "h-11 px-3 text-xs font-semibold shadow-sm sm:px-4 sm:text-sm")}>
          Ro&apos;yxatdan o&apos;tish
        </Link>
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm font-medium sm:block" title={user.name}>
        {user.name}
      </span>
      <span className="rounded-full bg-tint-2 px-2.5 py-1 text-xs font-semibold text-green-900">{ROLE_LABEL[user.role]}</span>
      <Button
        variant="outline"
        className="h-11 px-3 text-sm"
        onClick={() => {
          logoutUser();
          router.push("/");
        }}
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Chiqish</span>
        <span className="sr-only sm:hidden">Chiqish</span>
      </Button>
    </div>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const { user } = useAuth();
  const links = LINKS.slice(1).filter((l) => !(user?.role === "user" && l.href !== "/assistant"));
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4">
        <Logo />
        <nav aria-label="Asosiy" className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive(path, l.href) && "bg-tint-1 text-green-800",
              )}
            >
              {l.label}
            </Link>
          ))}
          <ModeBadge className="ml-2" />
        </nav>
        <div className="flex items-center gap-2">
          <ModeBadge className="hidden min-[430px]:inline-flex sm:hidden" />
          <AuthArea />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Mobil"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
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
