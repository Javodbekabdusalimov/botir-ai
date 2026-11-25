"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/** /dashboard/* va /connect/* faqat biznes akkauntga. Kirmagan bo'lsa /login'ga yo'naltiradi. */
export function RequireBusiness({ children }: { children: React.ReactNode }) {
  return <Guard role="business">{children}</Guard>;
}

/** /me/* — har qanday kirgan foydalanuvchi (asosan mijoz) */
export function RequireUser({ children }: { children: React.ReactNode }) {
  return <Guard>{children}</Guard>;
}

function Guard({ children, role }: { children: React.ReactNode; role?: "business" }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (status === "out") router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [status, path, router]);

  if (status === "loading" || status === "out")
    return (
      <div role="status" aria-label="Tekshirilmoqda" className="mx-auto max-w-7xl animate-pulse space-y-4 px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-8 w-1/3 rounded-lg bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  if (role && user?.role !== role)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Bu bo&apos;lim biznes uchun</h1>
        <p className="mt-2 text-sm text-muted-foreground">Siz mijoz akkaunti bilan kirgansiz. Yordamchi sahifasida agent sizga yordam beradi.</p>
        <Link href="/assistant" className={cn(buttonVariants(), "mt-5 h-11 px-5 font-semibold")}>
          Yordamchiga o&apos;tish
        </Link>
      </div>
    );
  return <>{children}</>;
}
