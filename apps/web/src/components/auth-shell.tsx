import { LogoMark } from "@/components/logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-8 px-4 py-8 sm:py-14 lg:grid-cols-[1fr_26rem] lg:gap-14">
      <aside className="hidden lg:block lg:pt-6">
        <LogoMark className="size-12" />
        <h2 className="mt-6 text-balance font-display text-4xl font-extrabold leading-tight">
          Agent agent bilan gaplashadi, siz faqat <span className="text-agent">tasdiqlaysiz</span>.
        </h2>
        <ul className="mt-6 space-y-3 text-muted-foreground">
          <li className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />Narx katalogdan olinadi, chegirma biznes belgilagan limitdan oshmaydi.</li>
          <li className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />Pul faqat siz &quot;Tasdiqlayman&quot; bosgandan keyin.</li>
          <li className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />Biznes uchun Telegram va katalog ulash bir necha daqiqa.</li>
        </ul>
      </aside>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
