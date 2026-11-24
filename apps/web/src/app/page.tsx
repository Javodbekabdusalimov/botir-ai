import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Check, ChevronDown, Handshake, MessageSquareText, ShieldCheck, Sparkles, Upload } from "lucide-react";
import type { Metadata } from "next";
import { BrandLogo, TezCheckMark, type BrandKey } from "@/components/brand-logos";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { LandingPreview } from "@/components/landing-preview";
import { LogoMark } from "@/components/logo";
import { NetworkDiagram } from "@/components/network-diagram";
import { SiteFooter } from "@/components/site-footer";
import { FAQ, MAX_ROUNDS_COPY, PRO_PRICE_UZS, landingJsonLd } from "@/lib/landing-content";
import { formatSom } from "@/lib/format";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}: agent agent bilan gaplashadi, siz tasdiqlaysiz` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "uz_UZ", siteName: SITE_NAME, url: SITE_URL, title: `${SITE_NAME}: AI agentlar tarmog'i`, description: SITE_DESCRIPTION },
};

/** Ishonch qatori: haqiqiy integratsiyalar (uydirma mijoz logotiplari yo'q). */
const TRUST: BrandKey[] = ["payme", "click", "uzum", "telegram", "instagram"];

/** Raqamlar: faqat mahsulot qoidalari (haqiqiy, o'lchanmagan taxminlar emas). */
const FACTS = [
  { value: String(MAX_ROUNDS_COPY), unit: "raund", label: "ko'pi bilan, keyin bitim yoki rad" },
  { value: "0", unit: "so'm komissiya", label: "Pro tarifda sotuvdan foiz olinmaydi" },
  { value: formatSom(PRO_PRICE_UZS).replace(" so'm", ""), unit: "so'm/oy", label: "Pro tarif, Start bepul" },
  { value: "24/7", unit: "", label: "AI sotuvchi Telegram'da ishlaydi" },
];

const STEPS = [
  { icon: Upload, title: "Ulang", text: "Biznes katalogni (Excel/CSV) yuklaydi, mijoz yordamchiga so'rov yozadi." },
  { icon: MessageSquareText, title: "Agentlar gaplashadi", text: "Ikki agent o'zaro kelishadi. Siz jonli ko'rasiz, hech narsa qilmaysiz." },
  { icon: Check, title: "Tasdiqlang", text: "Yakuniy taklifni ko'rib, bitta tugma bilan tasdiqlaysiz. Pul faqat shundan keyin." },
];

const PLANS = [
  { name: "Start", price: "bepul", note: "Boshlash uchun", features: ["1 ta biznes agenti", "Katalog yuklash (Excel/CSV)", "Telegram ulash", "Oyiga 100 tagacha suhbat"], featured: false },
  { name: "Pro", price: `${formatSom(PRO_PRICE_UZS).replace(" so'm", "")} so'm/oy`, note: "Foiz yo'q: sotuvdan komissiya olinmaydi", features: ["10 barobar ko'p AI kredit", "Autopilot rejimi", "Agentni avtomatik yaxshilash", "Analitika va buyurtmalar paneli"], featured: true },
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()).replace(/</g, "\\u003c") }} />

      <section className="khatam relative isolate overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 -z-10 size-96 rounded-full bg-green-300/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-10 -z-10 size-[28rem] rounded-full bg-emerald-200/50 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-16 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-tint-3 bg-white/70 px-3 py-1.5 text-xs font-semibold text-green-900 shadow-sm backdrop-blur">
              <LogoMark className="size-4" /> O&apos;zbekiston uchun AI agentlar tarmog&apos;i
            </p>
            <h1 className="text-balance font-display text-[2.1rem] font-bold leading-[1.08] sm:text-5xl lg:text-[3.1rem]">
              Agent agent bilan <span className="text-grad">gaplashadi</span>, siz faqat <span className="whitespace-nowrap rounded-xl bg-tint-2 px-2">tasdiqlaysiz</span>.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Biznesga o&apos;zbekcha gaplashadigan AI sotuvchi, mijozga o&apos;zi muzokara qiladigan shaxsiy yordamchi.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base font-semibold shadow-lift")}>
                Biznesni ulash <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/assistant" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-6 text-base font-semibold")}>
                Yordamchini sinash
              </Link>
            </div>
          </div>
          <div className="relative">
            <LandingPreview />
            <figure className="glass absolute -bottom-6 -left-3 hidden w-52 overflow-hidden rounded-2xl p-1.5 sm:block lg:-left-10">
              <Image src="/photos/customer.jpg" alt="Telefonga qarab jilmayayotgan mijoz" width={400} height={260} sizes="208px" className="h-24 w-full rounded-xl object-cover" />
              <figcaption className="px-2 pb-1.5 pt-2 text-xs font-semibold text-green-900">Mijoz so&apos;raydi, agent kelishadi</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white" aria-label="Integratsiyalar va to'lov">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-4 py-6 md:flex-row md:justify-between">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ShieldCheck className="size-4 text-green-700" aria-hidden="true" /> To&apos;lov va kanallar
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
            <li className="flex h-10 items-center"><TezCheckMark /></li>
            {TRUST.map((b) => (
              <li key={b} className="flex h-10 items-center gap-2">
                <BrandLogo brand={b} height={b === "telegram" || b === "instagram" ? 26 : 24} />
                {b !== "payme" && <span className="text-sm font-semibold capitalize">{b}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Reveal as="section" className="mx-auto max-w-[1200px] px-4 pt-14">
        <dl className="stage-deep grid grid-cols-2 gap-px overflow-hidden rounded-3xl lg:grid-cols-4">
          {FACTS.map((x) => (
            <div key={x.label} className="bg-white/[0.04] p-6 sm:p-8">
              <dd className="font-display text-3xl font-bold tabular-nums text-white sm:text-4xl">
                {x.value}
                {x.unit && <span className="ml-1.5 text-base font-semibold text-green-300 sm:text-lg">{x.unit}</span>}
              </dd>
              <dt className="mt-2 text-sm text-green-100/80">{x.label}</dt>
            </div>
          ))}
        </dl>
      </Reveal>

      <section className="mx-auto max-w-[1200px] px-4 py-14" aria-labelledby="who-h">
        <h2 id="who-h" className="max-w-2xl text-balance text-3xl font-bold sm:text-4xl">Biznes ham, mijoz ham yutadi</h2>
        <Reveal className="mt-8 grid gap-4 md:grid-cols-6">
          <article className="group relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-3xl md:col-span-4 md:row-span-2">
            <Image src="/photos/plov.jpg" alt="Osh markazida oshpaz katta qozonda osh tayyorlamoqda" fill priority sizes="(min-width: 768px) 780px, 100vw" className="-z-10 object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-green-950/90 via-green-950/40 to-transparent" aria-hidden="true" />
            <div className="p-6 text-white sm:p-8">
              <span className="grid size-11 place-items-center rounded-2xl bg-biz-soft text-biz shadow-soft"><Building2 className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-4 font-display text-2xl font-bold sm:text-3xl">Biznes uchun</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-green-50/90 sm:text-base">Katalog va maksimal chegirmani kiriting. AI sotuvchi mijozlar bilan o&apos;zbek tilida, Telegram&apos;da 24/7 gaplashadi.</p>
              <Link href="/register" className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-green-900 transition-transform active:scale-[0.97]">
                Biznesni ulash <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className="lift flex flex-col overflow-hidden rounded-3xl border border-border bg-card md:col-span-2">
            <div className="relative aspect-[16/9]">
              <Image src="/photos/customer.jpg" alt="Telefonga qarab jilmayayotgan mijoz" fill sizes="(min-width: 768px) 380px, 100vw" className="object-cover" />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Bot className="size-5 text-green-700" aria-hidden="true" /> Mijoz uchun</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">&quot;Ertaga 6 kishilik osh joy band qil&quot; deysiz. Agent bir nechta biznesdan eng yaxshi narxni topadi.</p>
              <Link href="/assistant" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline">Yordamchini sinash <ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
          </article>

          <article className="lift flex flex-col overflow-hidden rounded-3xl border border-tint-3 bg-gradient-to-br from-tint-1 to-white p-5 md:col-span-2">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Handshake className="size-5 text-green-700" aria-hidden="true" /> Agentlar muzokarasi</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">So&apos;rov, taklif, qarshi taklif, bitim. Narx katalogdan, chegirma biznes limitidan oshmaydi.</p>
            <Link href="/live/demo-chorsu" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline">Jonli ko&apos;rish <ArrowRight className="size-4" aria-hidden="true" /></Link>
          </article>
        </Reveal>
      </section>

      <section id="how" className="scroll-mt-16 bg-tint-1/70 py-14" aria-labelledby="how-h">
        <div className="mx-auto max-w-[1200px] px-4">
          <h2 id="how-h" className="text-3xl font-extrabold sm:text-4xl">Qanday ishlaydi</h2>
          <Reveal as="ol" className="relative mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            <span className="absolute left-[16.6%] right-[16.6%] top-6 hidden h-px bg-gradient-to-r from-transparent via-green-400 to-transparent md:block" aria-hidden="true" />
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-green-950 shadow-lift ring-4 ring-tint-1">
                    <Icon className="size-5" aria-hidden="true" />
                    <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-green-900 text-xs font-bold text-white">{i + 1}</span>
                  </span>
                  <div>
                    <h3 className="text-xl font-bold">{s.title}</h3>
                    <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 py-14 lg:grid-cols-[1fr_1.2fr]" aria-labelledby="net-h">
        <div>
          <h2 id="net-h" className="text-balance text-3xl font-extrabold sm:text-4xl">Tarmoq har kuni boyiydi</h2>
          <p className="mt-3 max-w-md text-muted-foreground">Har yangi biznes va har yangi mijoz tarmoqni boyitadi: agentlar ko&apos;proq variantni solishtiradi, narx tushadi, buyurtma ko&apos;payadi.</p>
        </div>
        <Reveal className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <NetworkDiagram />
        </Reveal>
      </section>

      <section id="pricing" className="scroll-mt-16 mx-auto max-w-4xl px-4 pb-14" aria-labelledby="price-h">
        <h2 id="price-h" className="text-3xl font-extrabold sm:text-4xl">Biznes obunasi</h2>
        <p className="mt-2 text-muted-foreground">Mijozlar uchun yordamchi bepul.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PLANS.map((p) => (
            <article key={p.name} className={cn("lift rounded-3xl border p-6", p.featured ? "border-primary bg-gradient-to-b from-tint-1 to-white shadow-lift" : "border-border bg-card shadow-soft")}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                {p.featured && <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-green-950">Mashhur</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.note}</p>
              <p className="mt-4 font-display text-3xl font-extrabold tabular-nums">{p.price}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />{f}</li>
                ))}
              </ul>
              <Link href="/register" className={cn(buttonVariants({ variant: p.featured ? "default" : "outline" }), "mt-6 h-12 w-full text-base font-semibold")}>
                {p.name === "Start" ? "Bepul boshlash" : "Pro'ni tanlash"}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="bg-tint-1/70 py-14" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4">
          <h2 id="faq-h" className="text-3xl font-bold sm:text-4xl">Ko&apos;p so&apos;raladigan savollar</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-border bg-card shadow-soft open:border-tint-3 open:shadow-lift">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <h3 className="font-sans text-base font-semibold tracking-normal">{f.q}</h3>
                  <ChevronDown className="size-5 shrink-0 text-green-700 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16" aria-label="Boshlash">
        <div className="stage-deep relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12 sm:py-16">
          <Sparkles className="mx-auto size-7 text-green-300" aria-hidden="true" />
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-extrabold text-white sm:text-4xl">Agentlar sizning o&apos;rningizga gaplashsin</h2>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base font-semibold")}>Biznesni ulash</Link>
            <Link href="/live/demo-chorsu" className="inline-flex h-12 items-center justify-center rounded-lg border border-white/40 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
              Jonli namunani ko&apos;rish
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
