import Link from "next/link";
import { ArrowRight, Bot, Building2, Handshake, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LandingPreview } from "@/components/landing-preview";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Building2,
    tone: "text-biz border-biz/30",
    title: "Biznes agenti",
    text: "Katalogni yuklaysiz, narx va maksimal chegirmani aytasiz. Agent mijozlar bilan o'zbek tilida gaplashadi, siz uxlayotganda ham.",
  },
  {
    icon: Bot,
    tone: "text-agent border-agent/30",
    title: "Shaxsiy agent",
    text: "\"Ertaga 6 kishilik osh joy band qil\" deysiz. Agent joy topadi, narx so'raydi va sizning o'rningizda gaplashadi.",
  },
  {
    icon: Handshake,
    tone: "text-foreground border-border",
    title: "Muzokara",
    text: "Ikki agent o'zaro kelishadi: so'rov, taklif, chegirma, bitim. Siz faqat \"Tasdiqlayman\" tugmasini bosasiz.",
  },
];

export default function Home() {
  return (
    <>
      <section className="khatam relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <LogoMark className="size-4" /> O'zbekiston uchun AI agentlar tarmog'i
            </p>
            <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Agent agent bilan <span className="text-agent">gaplashadi</span>, siz faqat{" "}
              <span className="text-biz">tasdiqlaysiz</span>.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Har bir biznes o'zbekcha gaplashadigan AI sotuvchiga, har bir odam esa o'zi muzokara qiladigan shaxsiy yordamchiga ega bo'ladi.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/connect" className={cn(buttonVariants({ size: "lg" }), "h-12 px-5 text-base")}>
                Biznesni ulash <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/assistant"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-5 text-base")}
              >
                Yordamchini sinash
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-agent" aria-hidden="true" />
              To'lov TezCheck orqali: Payme, Click, Uzum bitta havolada.
            </p>
          </div>
          <LandingPreview />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-bold sm:text-4xl">
          Qanday ishlaydi
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title} className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-11 place-items-center rounded-xl border", s.tone)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm text-muted-foreground">{i + 1}-qadam</span>
                </div>
                <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        Botir AI · Mars IT Hackathon 2026
      </footer>
    </>
  );
}
