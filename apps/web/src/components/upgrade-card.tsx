import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Server 402 xabari: Pro/Max'da tokenlar tugasa "...tokenlar tugadi...", FREE'da "Bu imkoniyat Pro tarifida...". */
const tokensOut = (message: string) => /token/i.test(message);

/** 402 (`UpgradeRequiredError`): limit tugadi → /narxlar. Matn server xabaridan, narx bu yerda yozilmaydi. */
export function UpgradeCard({ message, className }: { message: string; className?: string }) {
  const out = tokensOut(message);
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-2xl border border-tint-3 bg-tint-1 p-4 text-sm ${className ?? ""}`}>
      <Sparkles className="size-5 shrink-0 text-green-800" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-green-950">{out ? "Bugungi tokenlar tugadi, 00:00 da yangilanadi" : "Bugungi bepul limit tugadi"}</p>
        {!out && <p className="mt-0.5 text-muted-foreground">{message}</p>}
      </div>
      <Link href="/narxlar" className={buttonVariants({ className: "h-11 px-4" })}>
        {out ? "Max tarifini ko'rish" : "Tariflarni ko'rish"}
      </Link>
    </div>
  );
}
