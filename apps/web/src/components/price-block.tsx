"use client";

import { useState } from "react";
import { useCountUp } from "@/hooks/use-count-up";
import { formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PriceLine {
  name: string;
  price: number;
  qty: number;
}

/**
 * Jami narx. Chizilgan narx = joriy savatning chegirmasiz summasi (subtotal), eski taklif narxi emas:
 * savatga narsa qo'shilsa "tejash" soxta ko'rinmasin. Qo'shilgan pozitsiyalar alohida yoziladi.
 */
export function PriceBlock({ price, items, compact }: { price: number; items: PriceLine[]; compact?: boolean }) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const names = items.map((i) => i.name);
  const [first] = useState<string[]>(names);
  const added = names.filter((n) => !first.includes(n));
  const pct = subtotal > price && subtotal > 0 ? Math.round(((subtotal - price) / subtotal) * 100) : 0;
  return (
    <div className={cn("flex items-end justify-between gap-3", compact ? "mt-1" : "mt-3 border-t border-border pt-3")}>
      <div className="pb-1">
        <span className="text-sm font-medium">Jami</span>
        {added.length > 0 && <p className="text-xs text-muted-foreground">+ {added.join(", ")} qo&apos;shildi</p>}
      </div>
      <div className="text-right" aria-live="polite">
        {pct > 0 && (
          <div key={`s${subtotal}`} className="text-sm tabular-nums">
            <span className="strike">{formatSom(subtotal)}</span>
            <span className="ml-1.5 font-semibold text-green-700">−{pct}%</span>
          </div>
        )}
        <AnimatedPrice price={price} />
      </div>
    </div>
  );
}

/** Narx raqami eski qiymatdan yangisiga sanab o'tadi (reduced-motion: darhol). */
function AnimatedPrice({ price }: { price: number }) {
  const shown = useCountUp(price, 600);
  return (
    <div className="font-display text-2xl font-bold tabular-nums text-green-800" aria-label={formatSom(price)}>
      <span aria-hidden="true">{formatSom(shown)}</span>
    </div>
  );
}
