import Image from "next/image";
import { cn } from "@/lib/utils";

/** Rasmiy logotiplar (public/brands, o'zgartirilmagan). Manba: public/CREDITS.md */
export const BRANDS = {
  payme: { src: "/brands/payme.svg", w: 1045, h: 344, name: "Payme" },
  click: { src: "/brands/click.svg", w: 157, h: 40, name: "Click" },
  uzum: { src: "/brands/uzum.svg", w: 1000, h: 1000, name: "Uzum" },
  telegram: { src: "/brands/telegram.svg", w: 24, h: 24, name: "Telegram" },
  instagram: { src: "/brands/instagram.svg", w: 24, h: 24, name: "Instagram" },
} as const;
export type BrandKey = keyof typeof BRANDS;

export function BrandLogo({ brand, height = 24, className }: { brand: BrandKey; height?: number; className?: string }) {
  const b = BRANDS[brand];
  const width = Math.round((b.w / b.h) * height);
  return <Image src={b.src} alt={b.name} width={width} height={height} className={cn("object-contain", className)} style={{ height, width }} />;
}

export function PayLogos({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label="To'lov usullari">
      {(["payme", "click", "uzum"] as const).map((k) => (
        <li key={k} className="grid h-9 place-items-center rounded-lg border border-border bg-card px-3 shadow-sm">
          {k === "payme" ? (
            <BrandLogo brand={k} height={height} />
          ) : (
            <span className="flex items-center gap-1.5">
              <BrandLogo brand={k} height={height + 2} />
              <span className="text-sm font-bold capitalize">{k}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
