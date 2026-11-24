import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BrandLogo, type BrandKey } from "@/components/brand-logos";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/Javodbekabdusalimov/botir-ai";

/** Footer integratsiyalari: faqat haqiqiy ulangan kanallar. */
export const INTEGRATIONS: { brand: BrandKey; label: string }[] = [
  { brand: "payme", label: "Payme" },
  { brand: "click", label: "Click" },
  { brand: "uzum", label: "Uzum" },
  { brand: "telegram", label: "Telegram" },
];

const TEAM = [
  { name: "Habibulloh Shuhratov", role: "arxitektura, agentlar" },
  { name: "Ibrat", role: "backend" },
  { name: "Javodbek Abdusalimov", role: "frontend, UI" },
];

/** Sayt footeri: brend, navigatsiya, integratsiya logotiplari, jamoa. */
export function SiteFooter() {
  return (
<footer className="border-t border-tint-3 bg-gradient-to-b from-tint-1 to-white">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark className="size-9" />
            <span className="font-display text-xl font-bold">
              Botir <span className="text-agent">AI</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Agent agent bilan gaplashadi, siz faqat tasdiqlaysiz. O&apos;zbekiston bizneslari va mijozlari uchun AI agentlar tarmog&apos;i.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-green-800 px-3 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="size-3.5" aria-hidden="true" /> Mars IT Hackathon 2026
          </span>
        </div>

        <nav aria-label="Mahsulot">
          <p className="text-sm font-bold">Mahsulot</p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {[
              ["/assistant", "Yordamchi"],
              ["/register", "Biznesni ulash"],
              ["/live/demo-chorsu", "Muzokara namunasi"],
              ["/#how", "Qanday ishlaydi"],
              ["/#pricing", "Narxlar"],
            ].map(([h, l]) => (
              <li key={h}>
                <Link href={h} className="inline-flex min-h-9 items-center hover:text-green-800 hover:underline">
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-bold">Integratsiyalar</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {INTEGRATIONS.map((i) => (
              <li key={i.brand} className="flex h-10 items-center justify-center rounded-xl border border-border bg-card px-2 shadow-sm">
                <BrandLogo brand={i.brand} height={i.brand === "telegram" ? 20 : 16} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-bold">Jamoa</p>
          <ul className="mt-3 space-y-3">
            {TEAM.map((t) => (
              <li key={t.name} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-2 text-xs font-bold text-green-900" aria-hidden="true">
                  {t.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.role}</span>
                </span>
              </li>
            ))}
          </ul>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "mt-5 h-11 gap-2 px-4 font-semibold")}>
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
            GitHub
          </a>
        </div>
      </div>
      <div className="border-t border-tint-3">
        <p className="mx-auto max-w-[1200px] px-4 py-4 text-xs text-muted-foreground">© 2026 Botir AI. Namuna bizneslar fiktiv. Brend logotiplari ularning egalariga tegishli.</p>
      </div>
    </footer>
  );
}
