"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Ekrandan pastda turgan blokni birinchi marta ko'ringanda yumshoq ko'taradi (opacity + translate).
 * Kontrakt: SSR va JS yo'q holatda kontent to'liq ko'rinadi; IntersectionObserver bo'lmasa ham yashirilmaydi;
 * ekrandagi bloklar umuman yashirilmaydi (CLS/flash yo'q); `prefers-reduced-motion` da CSS animatsiyani o'chiradi.
 */
export function Reveal({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "ol" | "dl" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.hidden = "true";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.hidden = "false";
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} className={cn("reveal", className)}>
      {children}
    </Component>
  );
}
