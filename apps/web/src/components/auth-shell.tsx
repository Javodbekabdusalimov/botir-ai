import Image from "next/image";
import { BrandLogo, TezCheckMark } from "@/components/brand-logos";
import { LogoMark } from "@/components/logo";

/** Kirish/ro'yxatdan o'tish ramkasi: chapda rasmli va'da paneli (lg+), o'ngda forma kartasi. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-8 px-4 py-8 sm:py-14 lg:grid-cols-[1fr_26rem] lg:gap-10">
      <aside className="relative isolate hidden min-h-[30rem] flex-col justify-between overflow-hidden rounded-3xl p-8 text-white lg:flex">
        <Image src="/photos/plov.jpg" alt="Osh markazida oshpaz katta qozonda osh tayyorlamoqda" fill sizes="520px" priority className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-green-950/95 via-green-950/60 to-green-900/30" aria-hidden="true" />
        <LogoMark className="size-11 rounded-xl bg-white/90 p-1.5" />
        <div>
          <p className="text-balance font-display text-3xl font-extrabold leading-tight">
            Agent agent bilan gaplashadi, siz faqat <span className="text-green-300">tasdiqlaysiz</span>.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-green-50/90">
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-green-300" />Narx katalogdan olinadi, chegirma limitdan oshmaydi.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-green-300" />Pul faqat siz &quot;Tasdiqlayman&quot; bosgandan keyin.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-green-300" />Telegram va katalog ulash bir necha daqiqa.</li>
          </ul>
          <ul className="mt-6 flex flex-wrap items-center gap-2" aria-label="To'lov va kanallar">
            <li className="flex h-9 items-center rounded-xl bg-white px-3"><TezCheckMark /></li>
            {(["payme", "click", "uzum", "telegram"] as const).map((b) => (
              <li key={b} className="flex h-9 items-center rounded-xl bg-white px-3">
                <BrandLogo brand={b} height={b === "telegram" ? 20 : 16} />
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
