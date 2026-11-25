"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { landingFor } from "@/app/login/login-form";

/** Kirgan foydalanuvchi bosh sahifada qolmaydi: biznes → panel, mijoz → yordamchi. */
export function HomeRedirect() {
  const router = useRouter();
  const { status, user } = useAuth();
  useEffect(() => {
    if (status === "in" && user) router.replace(landingFor(user.role));
  }, [status, user, router]);
  return null;
}
