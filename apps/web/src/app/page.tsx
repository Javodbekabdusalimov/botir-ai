import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bot, Building2, Check, ChevronDown, Handshake, MessageSquareText, ShieldCheck, Upload } from "lucide-react";
import type { Metadata } from "next";
import { BrandLogo, TezCheckMark, type BrandKey } from "@/components/brand-logos";
import { Reveal } from "@/components/reveal";
import { LandingPreview } from "@/components/landing-preview";
import { HeroSage } from "@/components/hero-sage";
import { HomeRedirect } from "@/components/home-redirect";
import { NetworkDiagram } from "@/components/network-diagram";
import { SiteFooter } from "@/components/site-footer";
import { FAQ, FREE_DAILY_SEARCHES, INTRO_PRICE_UZS, MAX_PRICE_UZS, MAX_ROUNDS_COPY, MAX_TOKENS_COPY, PRO_PRICE_UZS, PRO_TOKENS_COPY, landingJsonLd } from "@/lib/landing-content";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}: agent agent bilan gaplashadi, siz tasdiqlaysiz` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "uz_UZ", siteName: SITE_NAME, url: SITE_URL, title: `${SITE_NAME}: AI agentlar tarmog'i`, description: SITE_DESCRIPTION, images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title: `${SITE_NAME}: AI agentlar tarmog'i`, description: SITE_DESCRIPTION, images: ["/opengraph-image"] },
};

/** Ishonch qatori: haqiqiy integratsiyalar (uydirma mijoz logotiplari yo'q). */
const TRUST: BrandKey[] = ["payme", "click", "uzum", "telegram"];

/** Raqamlar: faqat mahsulot qoidalari (haqiqiy, o'lchanmagan taxminlar emas). */
const FACTS = [
  { value: String(MAX_ROUNDS_COPY), unit: "raund", label: "muzokara ko'pi bilan shuncha davom etadi" },
  { value: "0", unit: "komissiya", label: "Hech qaysi tarifda sotuvdan foiz olinmaydi" },
  { value: "0", unit: "so'm", label: `Free tarifi: kuniga ${FREE_DAILY_SEARCHES} ta qidiruv bepul` },
  { value: "1", unit: "tasdiq", label: "to'lov faqat sizning tasdig'ingizdan keyin" },
];

const STEPS = [
  { icon: Upload, title: "Ulang", text: "Biznes katalogni (Excel yoki CSV) yuklaydi, mijoz yordamchiga so'rovini yozadi." },
  { icon: MessageSquareText, title: "Agentlar kelishadi", text: "Ikki agent o'zaro muzokara qiladi. Siz jarayonni jonli kuzatasiz, aralashish shart emas." },
  { icon: Check, title: "Tasdiqlang", text: "Yakuniy taklifni ko'rib, bitta tugma bilan tasdiqlaysiz. To'lov faqat shundan keyin." },
];

/** Narxlar landing-content.ts da (egasi tasdiqlagan, 2026-11-25). Sotib olish /narxlar sahifasida (narx API'dan). */
const intro = `1-oy ${formatSom(INTRO_PRICE_UZS)}, keyin`;
const PLANS = [
  { name: "Free", price: "bepul", note: "Boshlash uchun", features: [`Kuniga ${FREE_DAILY_SEARCHES} ta qidiruv`, "Joylar, narx va reytingni solishtirish", "Biznes uchun katalog yuklash (Excel/CSV)"], featured: false, cta: { href: "/register", label: "Bepul boshlash" } },
  { name: "Pro", price: `${formatSom(PRO_PRICE_UZS)}/oy`, note: intro, features: [PRO_TOKENS_COPY, "Agent siz uchun savdolashadi va buyurtma beradi", "Telegram akkauntini ulash"], featured: true, cta: { href: "/narxlar", label: `Pro olish: 1-oy ${formatSom(INTRO_PRICE_UZS)}` } },
  { name: "Max", price: `${formatSom(MAX_PRICE_UZS)}/oy`, note: intro, features: [MAX_TOKENS_COPY, "Pro'dagi hammasi", "Pro'dan 2 baravar ko'p token"], featured: false, cta: { href: "/narxlar", label: `Max olish: 1-oy ${formatSom(INTRO_PRICE_UZS)}` } },
];

export default function Home() {
  return (
    <>
      <HomeRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()).replace(/</g, "\\u003c") }} />

      <HeroSage />

      {/* Integratsiyalar */}
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8" aria-label="Integratsiyalar va to'lov">
        <div className="glass flex flex-col items-center gap-5 rounded-2xl px-5 py-5 md:flex-row md:justify-between md:px-7">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-green-800" aria-hidden="true" /> To&apos;lov va kanallar
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <li className="flex h-9 items-center"><TezCheckMark /></li>
            {TRUST.map((b) => (
              <li key={b} className="flex h-9 items-center gap-2">
                <BrandLogo brand={b} height={b === "telegram" ? 24 : 22} />
                {b !== "payme" && <span className="text-sm font-semibold capitalize text-green-950">{b}</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">To&apos;lov TezCheck orqali (Payme, Click, Uzum). Hozir sinov rejimi.</p>
      </section>

      {/* Jonli muzokara */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:px-8" aria-labelledby="live-h">
        <div className="min-w-0">
          <Eyebrow>Jonli namuna</Eyebrow>
          <h2 id="live-h" className="mt-4 text-balance text-4xl text-green-950 sm:text-5xl">
            Muzokara <span className="text-grad">ko&apos;z oldingizda</span> boradi
          </h2>
          <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
            Mijoz agenti so&apos;rov yuboradi, biznes agenti katalogdagi narx bilan javob beradi. Ko&apos;pi bilan {MAX_ROUNDS_COPY} raundda bitim tuziladi yoki muzokara to&apos;xtaydi.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-green-950">
            {["Narx faqat katalogdan olinadi", "Chegirma siz belgilagan chegaradan oshmaydi", "Yakuniy qaror har doim sizda"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid size-5 place-items-center rounded-full bg-green-900 text-white"><Check className="size-3" aria-hidden="true" /></span>
                {t}
              </li>
            ))}
          </ul>
          <Link href="/live/demo-chorsu" className="mt-8 inline-flex h-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-5 text-sm font-semibold text-green-950 backdrop-blur-md transition-colors hover:bg-white/85">
            To&apos;liq ekranda ko&apos;rish <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <Reveal className="min-w-0">
          <LandingPreview />
        </Reveal>
      </section>

      {/* Raqamlar */}
      <Reveal as="section" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FACTS.map((x) => (
            <div key={x.label} className="glass rounded-2xl p-6 sm:p-7">
              <dd className="font-display text-4xl tabular-nums text-green-950 sm:text-5xl">
                {x.value}
                {x.unit && <span className="ml-1.5 font-sans text-sm font-medium text-muted-foreground sm:text-base">{x.unit}</span>}
              </dd>
              <dt className="mt-2 text-sm text-muted-foreground">{x.label}</dt>
            </div>
          ))}
        </dl>
      </Reveal>

      {/* Kim uchun */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8" aria-labelledby="who-h">
        <Eyebrow>Kim uchun</Eyebrow>
        <h2 id="who-h" className="mt-4 max-w-2xl text-balance text-4xl text-green-950 sm:text-5xl">
          Biznes ham, mijoz ham <span className="text-grad">yutadi</span>
        </h2>
        <Reveal className="mt-10 grid gap-4 md:grid-cols-6">
          <article className="group relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-[1.75rem] md:col-span-4 md:row-span-2">
            <Image src="/photos/plov.jpg" alt="Osh markazida oshpaz katta qozonda osh tayyorlamoqda" fill sizes="(min-width: 768px) 780px, 100vw" className="-z-10 object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#1b1f1c]/90 via-[#1b1f1c]/35 to-transparent" aria-hidden="true" />
            <div className="p-6 text-white sm:p-8">
              <span className="grid size-11 place-items-center rounded-2xl border border-white/40 bg-white/20 backdrop-blur-md"><Building2 className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-4 font-display text-3xl font-normal sm:text-4xl">Biznes uchun</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">Katalog va eng katta chegirmani kiriting. AI sotuvchi mijozlar bilan o&apos;zbek tilida, Telegram&apos;da kecha-kunduz gaplashadi.</p>
              <Link href="/register" className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-green-950 transition-transform active:scale-[0.97]">
                Biznesni ulash <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className="glass flex flex-col overflow-hidden rounded-[1.75rem] md:col-span-2">
            <div className="relative aspect-[16/9]">
              <Image src="/photos/customer.jpg" alt="Telefonga qarab jilmayayotgan mijoz" fill sizes="(min-width: 768px) 380px, 100vw" className="object-cover" />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="flex items-center gap-2 font-sans text-lg"><Bot className="size-5 text-green-800" aria-hidden="true" /> Mijoz uchun</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">&quot;Ertaga 6 kishiga osh uchun joy band qil&quot; deysiz. Agent bir nechta biznesdan eng qulay narxni topadi.</p>
              <Link href="/assistant" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-900 hover:underline">Yordamchini sinash <ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
          </article>

          <article className="glass flex flex-col rounded-[1.75rem] p-5 md:col-span-2">
            <h3 className="flex items-center gap-2 font-sans text-lg"><Handshake className="size-5 text-green-800" aria-hidden="true" /> Agentlar muzokarasi</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">So&apos;rov, taklif, qarshi taklif va bitim. Narx katalogdan olinadi, chegirma biznes chegarasidan oshmaydi.</p>
            <Link href="/live/demo-chorsu" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-900 hover:underline">Jonli ko&apos;rish <ArrowRight className="size-4" aria-hidden="true" /></Link>
          </article>
        </Reveal>
      </section>

      {/* Qanday ishlaydi */}
      <section id="how" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-labelledby="how-h">
        <div className="stage-deep overflow-hidden rounded-[2rem] px-6 py-14 text-white sm:px-10 lg:px-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Qanday ishlaydi</p>
          <h2 id="how-h" className="mt-4 max-w-xl text-balance text-4xl text-white sm:text-5xl">
            Uch qadam, <span className="text-grad">bitta tasdiq</span>
          </h2>
          <Reveal as="ol" className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex flex-col rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-white text-green-950"><Icon className="size-5" aria-hidden="true" /></span>
                    <span className="font-display text-3xl tabular-nums text-white/60">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 font-sans text-xl text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{s.text}</p>
                </li>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* Tarmoq */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:px-8" aria-labelledby="net-h">
        <div className="min-w-0">
          <Eyebrow>Tarmoq</Eyebrow>
          <h2 id="net-h" className="mt-4 text-balance text-4xl text-green-950 sm:text-5xl">
            Tarmoq har kuni <span className="text-grad">boyiydi</span>
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">Har bir yangi biznes va mijoz tarmoqni kengaytiradi: agentlar ko&apos;proq variantni solishtiradi, mijoz qulay narx topadi, biznes ko&apos;proq buyurtma oladi.</p>
        </div>
        <Reveal className="glass min-w-0 rounded-[1.75rem] p-4 sm:p-6">
          <NetworkDiagram />
        </Reveal>
      </section>

      {/* Narxlar */}
      <section id="pricing" className="scroll-mt-20 mx-auto max-w-4xl px-4 pb-20" aria-labelledby="price-h">
        <div className="text-center">
          <Eyebrow>Narxlar</Eyebrow>
          <h2 id="price-h" className="mt-4 text-4xl text-green-950 sm:text-5xl">
            Oddiy <span className="text-grad">tariflar</span>
          </h2>
          <p className="mt-3 text-muted-foreground">Mijozlar ham, bizneslar ham shu tariflardan foydalanadi. Komissiya yo&apos;q.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <article key={p.name} className={cn("flex flex-col rounded-[1.75rem] p-7", p.featured ? "stage-deep text-white shadow-[0_30px_60px_-30px_rgb(27_31_28/0.6)]" : "glass")}>
              <div className="flex items-center justify-between">
                <h3 className={cn("font-sans text-xl", p.featured ? "text-white" : "text-green-950")}>{p.name}</h3>
                {p.featured && <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">Tavsiya etiladi</span>}
              </div>
              <p className={cn("mt-1 text-sm", p.featured ? "text-white/75" : "text-muted-foreground")}>{p.note}</p>
              <p className={cn("mt-5 font-display text-2xl tabular-nums sm:text-3xl", p.featured ? "text-white" : "text-green-950")}>{p.price}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5"><Check className={cn("mt-0.5 size-4 shrink-0", p.featured ? "text-[#f6c27a]" : "text-green-800")} aria-hidden="true" />{f}</li>
                ))}
              </ul>
              <Link href={p.cta.href} className={cn("mt-7 grid h-12 place-items-center rounded-full text-sm font-semibold transition-colors", p.featured ? "bg-white text-green-950 hover:bg-white/90" : "bg-green-900 text-white hover:bg-green-950")}>
                {p.cta.label}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 pb-20" aria-labelledby="faq-h">
        <div className="text-center">
          <Eyebrow>Savollar</Eyebrow>
          <h2 id="faq-h" className="mt-4 text-4xl text-green-950 sm:text-5xl">
            Ko&apos;p so&apos;raladigan <span className="text-grad">savollar</span>
          </h2>
        </div>
        <div className="mt-10 space-y-2.5">
          {FAQ.map((f) => (
            <details key={f.q} className="glass group rounded-2xl open:bg-white/70">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <h3 className="font-sans text-base font-semibold tracking-normal text-green-950">{f.q}</h3>
                <ChevronDown className="size-5 shrink-0 text-green-800 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" aria-label="Boshlash">
        <div className="stage-deep relative overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:px-12 sm:py-20">
          <h2 className="mx-auto max-w-2xl text-balance text-4xl text-white sm:text-6xl">
            Agentlar <span className="text-grad">siz uchun</span> gaplashsin
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/75">Ro&apos;yxatdan o&apos;tish bir daqiqa oladi. Free tarifi bepul.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="group inline-flex h-14 items-center gap-3 rounded-2xl bg-white py-2 pl-2 pr-5 text-sm font-semibold uppercase tracking-wide text-green-950 transition-transform hover:-translate-y-0.5">
              <span className="grid size-10 place-items-center rounded-xl bg-green-900 text-white transition-transform duration-300 group-hover:rotate-12"><Handshake className="size-5" aria-hidden="true" /></span>
              Biznesni ulash
            </Link>
            <Link href="/live/demo-chorsu" className="inline-flex h-14 items-center gap-1.5 rounded-2xl px-5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white">
              Jonli namunani ko&apos;rish <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-900 backdrop-blur-md">
      <span className="size-1.5 rounded-full bg-[#e0a24e]" aria-hidden="true" />
      {children}
    </p>
  );
}
