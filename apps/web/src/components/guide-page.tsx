import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { GUIDES, getGuide, guideJsonLd } from "@/lib/guides";
import { pageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export function guideMeta(slug: string): Metadata {
  const g = getGuide(slug);
  if (!g) return {};
  return pageMeta({ title: g.title, description: g.description, path: `/${g.slug}` });
}

/** Ommaviy qo'llanma sahifasi: breadcrumb, qisqa javob (TL;DR), savol-sarlavhali bo'limlar, FAQ, ichki havolalar. */
export function GuidePage({ slug }: { slug: string }) {
  const g = getGuide(slug);
  if (!g) notFound();
  const related = GUIDES.filter((x) => x.slug !== g.slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd(g)).replace(/</g, "\\u003c") }} />
      <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-green-800 hover:underline">Botir AI</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">{g.h1}</li>
          </ol>
        </nav>
        <h1 className="mt-4 text-balance font-display text-3xl font-extrabold leading-tight sm:text-4xl">{g.h1}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Yangilangan: <time dateTime={g.updated}>{g.updated.split("-").reverse().join(".")}</time></p>

        <section id="tldr" aria-label="Qisqa javob" className="mt-6 rounded-2xl border border-tint-3 bg-tint-1 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-green-800">Qisqa javob</p>
          <p className="mt-2 leading-relaxed">{g.answer}</p>
        </section>

        {g.steps && (
          <section aria-labelledby="steps-h" className="mt-10">
            <h2 id="steps-h" className="text-2xl font-bold">Qadamlar</h2>
            <ol className="mt-4 space-y-3">
              {g.steps.map((s, i) => (
                <li key={s.name} id={`qadam-${i + 1}`} className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-bold text-white" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3 className="font-sans text-base font-semibold tracking-normal">{s.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {g.sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-2xl font-bold">{s.h}</h2>
            {s.p.map((t) => (
              <p key={t} className="mt-3 leading-relaxed text-muted-foreground">{t}</p>
            ))}
            {s.list && (
              <ul className="mt-3 space-y-2">
                {s.list.map((t) => (
                  <li key={t} className="flex gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />{t}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {g.faq.length > 0 && (
          <section aria-labelledby="faq-h" className="mt-12">
            <h2 id="faq-h" className="text-2xl font-bold">Ko&apos;p so&apos;raladigan savollar</h2>
            <div className="mt-4 space-y-3">
              {g.faq.map((f) => (
                <details key={f.q} className="group rounded-2xl border border-border bg-card shadow-soft open:border-tint-3" open={g.slug === "savol-javob"}>
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <h3 className="font-sans text-base font-semibold tracking-normal">{f.q}</h3>
                    <ChevronDown className="size-5 shrink-0 text-green-700 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link href={g.cta.href} className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 px-6 text-base font-semibold")}>
            {g.cta.label} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-labelledby="rel-h" className="mt-12 border-t border-border pt-8">
          <h2 id="rel-h" className="text-lg font-bold">Yana o&apos;qing</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/${r.slug}`} className="flex min-h-14 items-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-soft hover:border-tint-3 hover:text-green-800">{r.h1}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
      <SiteFooter />
    </>
  );
}
