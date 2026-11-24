import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Check, ChevronDown, Clock3, Handshake, MessageSquareText, Percent, Quote, ShieldCheck, Sparkles, Upload, Zap } from "lucide-react";
import { BrandLogo, type BrandKey } from "@/components/brand-logos";
import { buttonVariants } from "@/components/ui/button";
import { LandingPreview } from "@/components/landing-preview";
import { LogoMark } from "@/components/logo";
import { BizAvatar } from "@/components/biz-avatar";
import { NetworkDiagram } from "@/components/network-diagram";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/Javodbekabdusalimov/botir-ai";

const BLOCKS = [
  {
    icon: Building2,
    tone: "bg-biz-soft text-biz",
    title: "Biznes uchun",
    text: "Katalog va maksimal chegirmani kiriting. AI sotuvchi mijozlar bilan o'zbek tilida, Telegram'da 24/7 gaplashadi.",
    cta: { href: "/register", label: "Biznesni ulash" },
    photo: "/photos/plov.jpg",
    alt: "Osh markazida oshpaz katta qozonda osh tayyorlamoqda",
  },
  {
    icon: Bot,
    tone: "bg-tint-2 text-green-800",
    title: "Mijoz uchun",
    text: "\"Ertaga 6 kishilik osh joy band qil\" deysiz. Shaxsiy agent bir nechta biznesdan eng yaxshi narxni topadi.",
    cta: { href: "/assistant", label: "Yordamchini sinash" },
    photo: "/photos/customer.jpg",
    alt: "Telefonga qarab jilmayayotgan mijoz",
  },
  {
    icon: Handshake,
    tone: "bg-muted text-foreground",
    title: "Agentlar muzokarasi",
    text: "So'rov, taklif, qarshi taklif, bitim: ko'pi bilan 3 raund. Narx katalogdan, chegirma biznes limitidan oshmaydi.",
    cta: { href: "/live/demo-chorsu", label: "Jonli ko'rish" },
    photo: "/photos/garage.jpg",
    alt: "Avtoservisda mexanik mashina ustida ishlamoqda",
  },
];

const STEPS = [
  { icon: Upload, title: "Ulang", text: "Biznes katalogni (Excel/CSV) yuklaydi, mijoz yordamchiga so'rov yozadi." },
  { icon: MessageSquareText, title: "Agentlar gaplashadi", text: "Ikki agent o'zaro kelishadi. Siz jonli ko'rasiz, hech narsa qilmaysiz." },
  { icon: Check, title: "Tasdiqlang", text: "Yakuniy taklifni ko'rib, bitta tugma bilan tasdiqlaysiz. Pul faqat shundan keyin." },
];

const PLANS = [
  {
    name: "Start",
    price: "bepul",
    note: "Boshlash uchun",
    features: ["1 ta biznes agenti", "Katalog yuklash (Excel/CSV)", "Telegram ulash", "Oyiga 100 tagacha suhbat"],
    featured: false,
  },
  {
    name: "Pro",
    price: "1 000 so'm/oy",
    note: "Foiz yo'q: sotuvdan komissiya olinmaydi",
    features: ["10 barobar ko'p AI kredit", "Autopilot rejimi", "Agentni avtomatik yaxshilash", "Analitika va buyurtmalar paneli"],
    featured: true,
  },
];

const INTEGRATIONS: { brand: BrandKey; label: string }[] = [
  { brand: "payme", label: "Payme" },
  { brand: "click", label: "Click" },
  { brand: "uzum", label: "Uzum" },
  { brand: "telegram", label: "Telegram" },
  { brand: "instagram", label: "Instagram" },
];

// Demo ko'rsatkichlar: haqiqiy mijoz ma'lumoti emas
const STATS = [
  { icon: Handshake, value: "3", label: "raundda kelishuv" },
  { icon: Clock3, value: "< 30 s", label: "bitta muzokara" },
  { icon: Percent, value: "-8%", label: "o'rtacha chegirma" },
  { icon: Zap, value: "24/7", label: "agent ishlaydi" },
];

// Fiktiv demo bizneslar va gaplar
const QUOTES = [
  { id: "chorsu", name: "Chilonzor Osh Markazi", role: "Demo biznes", text: "Katalogni yukladik, agent kechasi ham guruh buyurtmalariga javob beryapti. Chegirma limiti o'zimizda." },
  { id: "malika", name: "Malika Do'kon", role: "Demo biznes", text: "Mijoz narx so'raydi, agent katalogdan aytadi. Men faqat yakuniy tasdiqni ko'raman." },
  { id: "chilonzor", name: "Chilonzor AutoServis", role: "Demo biznes", text: "Moy almashtirish uchun yozilganlar soni oshdi, chunki javob darhol keladi." },
];

const FAQ = [
  { q: "Agent narxni o'zi to'qib chiqaradimi?", a: "Yo'q. Narx faqat katalogdan olinadi, chegirma biznes belgilagan maksimal foizdan oshmaydi (PolicyGuard)." },
  { q: "Pul qachon yechiladi?", a: "Faqat siz yakuniy taklifni [Tasdiqlayman] bilan tasdiqlagandan keyin, TezCheck orqali: Payme, Click yoki Uzum." },
  { q: "Telegram'ni qanday ulayman?", a: "Telegram Business (Premium) yoki telefon raqam, SMS kod va 2FA orqali. Sessiya shifrlanadi, istalgan payt uzasiz." },
  { q: "Agent xato qilsa-chi?", a: "Ishonchsiz holatda chat sizga yo'naltiriladi (odam kerak). Yaxshilash bo'limida o'zgarishni tasdiqlaysiz yoki [Rollback] qilasiz." },
];

const TEAM = [
  { name: "Habibulloh Shuhratov", role: "arxitektura, agentlar" },
  { name: "Ibrat", role: "backend" },
  { name: "Javodbek Abdusalimov", role: "frontend, UI" },
];

export default function Home() {
  return (
    <>
      <section className="khatam relative isolate overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 -z-10 size-96 rounded-full bg-green-300/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-10 -z-10 size-[28rem] rounded-full bg-emerald-200/50 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 size-72 rounded-full bg-amber-100/50 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-tint-3 bg-tint-1 px-3 py-1.5 text-xs font-semibold text-green-900">
              <LogoMark className="size-4" /> O&apos;zbekiston uchun AI agentlar tarmog&apos;i
            </p>
            <h1 className="text-balance font-display text-[2rem] font-bold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">
              Agent agent bilan <span className="text-agent">gaplashadi</span>, siz faqat <span className="rounded-lg bg-tint-2 px-2">tasdiqlaysiz</span>.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Har bir biznes o&apos;zbekcha gaplashadigan AI sotuvchiga, har bir odam esa o&apos;zi muzokara qiladigan shaxsiy yordamchiga ega bo&apos;ladi.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base font-semibold shadow-lift")}>
                Biznesni ulash <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/assistant" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-6 text-base font-semibold")}>
                Yordamchini sinash
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-green-700" aria-hidden="true" /> PolicyGuard</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-green-700" aria-hidden="true" /> Pul faqat tasdiqdan keyin</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-green-700" aria-hidden="true" /> TezCheck: Payme, Click, Uzum</li>
            </ul>
          </div>
          <LandingPreview />
        </div>
      </section>

      <section className="border-y border-border bg-card" aria-label="Integratsiyalar">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-4 py-6 md:flex-row md:justify-between">
          <p className="text-sm font-semibold text-muted-foreground">Integratsiyalar</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {INTEGRATIONS.map((i) => (
              <li key={i.brand} className="flex h-10 items-center gap-2" title={i.label}>
                <BrandLogo brand={i.brand} height={i.brand === "telegram" || i.brand === "instagram" ? 26 : 22} />
                {(i.brand === "telegram" || i.brand === "instagram" || i.brand === "uzum") && <span className="text-sm font-semibold">{i.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pt-12" aria-label="Raqamlar">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((x) => {
            const Icon = x.icon;
            return (
              <div key={x.label} className="rounded-2xl border border-tint-3 bg-gradient-to-br from-tint-1 to-white p-5 shadow-soft">
                <Icon className="size-5 text-green-700" aria-hidden="true" />
                <dd className="mt-3 font-display text-3xl font-bold tabular-nums text-green-900">{x.value}</dd>
                <dt className="text-sm text-muted-foreground">{x.label}</dt>
              </div>
            );
          })}
        </dl>
        <p className="mt-2 text-right text-xs text-muted-foreground">Demo ko&apos;rsatkichlar</p>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-12" aria-label="Imkoniyatlar">
        <div className="grid gap-4 md:grid-cols-3">
          {BLOCKS.map((b) => {
            const Icon = b.icon;
            return (
              <article key={b.title} className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image src={b.photo} alt={b.alt} fill sizes="(min-width: 768px) 380px, 100vw" loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  <span className={cn("absolute bottom-3 left-3 grid size-11 place-items-center rounded-2xl shadow-soft ring-1 ring-white/70", b.tone)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="font-display text-xl font-bold">{b.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{b.text}</p>
                  <Link href={b.cta.href} className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline">
                    {b.cta.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="how" className="scroll-mt-16 bg-tint-1/70 py-14" aria-labelledby="how-h">
        <div className="mx-auto max-w-[1200px] px-4">
          <h2 id="how-h" className="text-3xl font-extrabold sm:text-4xl">Qanday ishlaydi</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="relative rounded-2xl border border-tint-3 bg-card p-5 shadow-soft">
                  <span className="absolute right-4 top-3 font-display text-5xl font-extrabold text-tint-2" aria-hidden="true">{i + 1}</span>
                  <span className="grid size-11 place-items-center rounded-xl bg-primary text-green-950">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14" aria-labelledby="net-h">
        <h2 id="net-h" className="text-3xl font-extrabold sm:text-4xl">Tarmoq effekti</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Har yangi biznes va har yangi mijoz tarmoqni boyitadi: agentlar ko&apos;proq variantni solishtiradi, narx tushadi, buyurtma ko&apos;payadi.</p>
        <div className="mt-6 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <NetworkDiagram />
        </div>
      </section>

      <section id="pricing" className="scroll-mt-16 mx-auto max-w-4xl px-4 pb-14" aria-labelledby="price-h">
        <h2 id="price-h" className="text-3xl font-extrabold sm:text-4xl">Biznes obunasi</h2>
        <p className="mt-2 text-muted-foreground">Mijozlar uchun yordamchi bepul.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PLANS.map((p) => (
            <article key={p.name} className={cn("rounded-3xl border p-6", p.featured ? "border-primary bg-card shadow-lift" : "border-border bg-card shadow-soft")}>
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

      <section className="bg-tint-1/70 py-14" aria-labelledby="q-h">
        <div className="mx-auto max-w-[1200px] px-4">
          <h2 id="q-h" className="text-3xl font-bold sm:text-4xl">Bizneslar nima deydi</h2>
          <p className="mt-2 text-sm text-muted-foreground">Demo bizneslar va fikrlar fiktiv: mahsulot qanday ishlashini ko&apos;rsatish uchun.</p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {QUOTES.map((q) => (
              <li key={q.name} className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift">
                <Quote className="size-6 text-green-600" aria-hidden="true" />
                <p className="mt-3 flex-1 text-[15px] leading-relaxed">{q.text}</p>
                <div className="mt-5 flex items-center gap-3">
                  <BizAvatar id={q.id} name={q.name} size={44} />
                  <div>
                    <p className="text-sm font-bold">{q.name}</p>
                    <p className="text-xs text-muted-foreground">{q.role}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-3xl font-bold sm:text-4xl">Ko&apos;p so&apos;raladigan savollar</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-border bg-card shadow-soft open:border-tint-3 open:shadow-lift">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-5 shrink-0 text-green-700 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-16" aria-label="Boshlash">
        <div className="rounded-3xl bg-green-800 px-6 py-10 text-center text-white sm:px-12 sm:py-14">
          <Sparkles className="mx-auto size-7 text-green-300" aria-hidden="true" />
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-extrabold text-white sm:text-4xl">Agentlar sizning o&apos;rningizga gaplashsin</h2>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base font-semibold")}>
              Biznesni ulash
            </Link>
            <Link href="/assistant" className="inline-flex h-12 items-center justify-center rounded-lg border border-white/40 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
              Yordamchini sinash
            </Link>
          </div>
        </div>
      </section>

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
                ["/live/demo-chorsu", "Jonli muzokara"],
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
                  <BrandLogo brand={i.brand} height={i.brand === "telegram" || i.brand === "instagram" ? 20 : 16} />
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
          <p className="mx-auto max-w-[1200px] px-4 py-4 text-xs text-muted-foreground">© 2026 Botir AI. Demo bizneslar va fikrlar fiktiv. Brend logotiplari ularning egalariga tegishli.</p>
        </div>
      </footer>
    </>
  );
}
