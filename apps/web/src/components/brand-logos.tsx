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
  // click.svg: belgi chapda, o'ng tomoni bo'sh joy: faqat belgi qismini kesib olamiz
  const crop = brand === "click";
  const width = crop ? height : Math.round((b.w / b.h) * height);
  return <Image src={b.src} alt={b.name} width={crop ? b.w : width} height={crop ? b.h : height} className={cn(crop ? "object-cover object-left" : "object-contain", className)} style={{ height, width }} />;
}

export function PayLogos({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label="To'lov usullari">
      {(["payme", "click", "uzum"] as const).map((k) => (
        <li key={k} className="flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 shadow-sm">
          {k === "payme" ? (
            <BrandLogo brand={k} height={height} />
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <BrandLogo brand={k} height={height + 2} />
              <span className="text-sm font-bold capitalize leading-none">{k}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** TezCheck: rasmiy SVG yo'q, shuning uchun matnli belgi (galochka + so'z). Boshqa brendlarning logotipiga taqlid qilinmaydi. */
export function TezCheckMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-display text-sm font-bold tracking-tight text-green-900", className)}>
      <span className="grid size-5 place-items-center rounded-md bg-green-600 text-white">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      TezCheck
    </span>
  );
}
