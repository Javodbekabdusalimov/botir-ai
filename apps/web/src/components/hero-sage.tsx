"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Handshake, PackageOpen, Send, UserPlus, Zap } from "lucide-react";
import { IsoScene, type Seat } from "@/components/agent-room/iso-scene";
import { cn } from "@/lib/utils";

/** Bosh sahifa hero'si (sage + shaffof oyna). Hech bir element boshqasining ustiga chiqmaydi: hammasi o'z grid katagida. */

const STEPS = [
  { icon: UserPlus, label: "Ro'yxatdan o'ting" },
  { icon: PackageOpen, label: "Katalog yuklang" },
  { icon: Send, label: "Telegram'ni ulang" },
  { icon: Zap, label: "Agent sotadi" },
];

const DEMO_SEATS: Seat[] = [
  { key: "a", x: 0, y: 0, seed: 3, laptopGlow: true },
  { key: "b", x: 0, y: 0, seed: 5, active: true },
  { key: "c", x: 0, y: 0, seed: 8, laptopGlow: true },
];

const STATUS = [
  { k: "So'rov", v: "6 kishi, ertaga 19:00" },
  { k: "Taklif", v: "348 000 so'm, −8%" },
  { k: "Natija", v: "Tasdiqlandi, Payme" },
];

const STEP_MS = 2800;

export function HeroSage() {
  const [step, setStep] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(t);
  }, []);

  function onMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -6, y: ((e.clientX - r.left) / r.width - 0.5) * 8 });
  }

  return (
    <section className="px-3 pt-3 sm:px-4 sm:pt-4" aria-labelledby="hero-h">
      <div className="relative isolate mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(160deg,#7c8980_0%,#9aa69e_45%,#b8c0ba_100%)] text-white">
        {/* yumshoq yorug'lik dog'lari: dekor, matn ostida emas */}
        <div className="pointer-events-none absolute -right-40 top-1/3 -z-10 size-[36rem] rounded-full bg-[#f6c27a]/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-32 -top-32 -z-10 size-[28rem] rounded-full bg-white/15 blur-3xl" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-10 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:px-10 lg:pb-14 lg:pt-16">
          {/* chap: matn */}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex -space-x-2.5" aria-hidden="true">
                {["/photos/customer.jpg", "/photos/plov.jpg", "/photos/shop.jpg"].map((src) => (
                  <Image key={src} src={src} alt="" width={64} height={64} className="size-8 rounded-full object-cover ring-2 ring-white/70" />
                ))}
              </span>
              <p className="text-sm text-white/85">Osh markazi, do&apos;kon, servis — bitta AI sotuvchi</p>
            </div>

            <h1 id="hero-h" className="mt-7 text-balance text-[2.9rem] leading-[1.02] text-white sm:text-6xl xl:text-[4.6rem]">
              Agentlar <span className="text-grad">gaplashadi,</span>
              <br />
              siz faqat tasdiqlaysiz
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/85 sm:text-lg">
              Botir mijozlaringiz bilan Telegram&apos;da o&apos;zbekcha gaplashadi, narxni katalogdan oladi va chegirmani belgilagan chegarangizdan oshirmaydi.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex h-14 items-center gap-3 rounded-2xl bg-white py-2 pl-2 pr-5 text-sm font-semibold uppercase tracking-wide text-green-950 shadow-[0_10px_30px_-10px_rgb(27_31_28/0.45)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-green-900 text-white transition-transform duration-300 group-hover:rotate-12">
                  <Handshake className="size-5" aria-hidden="true" />
                </span>
                Biznesni ulash
              </Link>
              <Link href="/live/demo-chorsu" className="inline-flex h-14 items-center gap-1.5 rounded-2xl px-4 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white">
                Jonli muzokarani ko&apos;rish <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            {/* 4 qadam: shaffof kartalar, faol qadam progress chizig'i bilan */}
            <ol className="mt-10 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Boshlash qadamlari">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const on = i === step;
                return (
                  <li key={s.label} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setStep(i)}
                      aria-current={on ? "step" : undefined}
                      className={cn(
                        "flex h-[5.5rem] w-full flex-col justify-between rounded-2xl border p-3 text-left backdrop-blur-md transition-colors duration-300",
                        on ? "border-white/70 bg-white/30" : "border-white/35 bg-white/10 hover:bg-white/20",
                      )}
                    >
                      <Icon className="size-5 text-white" aria-hidden="true" />
                      <span className="text-[13px] font-medium leading-tight text-white">{s.label}</span>
                    </button>
                    <span className="mt-2.5 block h-0.5 overflow-hidden rounded-full bg-white/25">
                      <span key={on ? `on-${step}` : "off"} className={cn("block h-full rounded-full bg-white", on ? "hero-step-fill" : i < step ? "w-full" : "w-0")} />
                    </span>
                    <span className="mt-1.5 block text-xs tabular-nums text-white/75">0{i + 1}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* o'ng: izometrik xona, shaffof oyna ramkada */}
          <div className="min-w-0">
            <div
              ref={stage}
              onPointerMove={onMove}
              onPointerLeave={() => setTilt({ x: 0, y: 0 })}
              className="rounded-[1.75rem] border border-white/45 bg-white/20 p-3 shadow-[0_30px_60px_-30px_rgb(27_31_28/0.55)] backdrop-blur-md [perspective:1200px] sm:p-4"
            >
              <div className="flex items-center justify-between px-2 pb-1 pt-1 text-xs text-white/85">
                <span className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f6c27a] opacity-70 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2 rounded-full bg-[#f6c27a]" />
                  </span>
                  Agent xonasi · jonli
                </span>
                <span>Chilonzor Osh Markazi</span>
              </div>
              <div className="transition-transform duration-300 ease-out will-change-transform" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
                <IsoScene seats={DEMO_SEATS} botirActive />
              </div>
              {/* holat qatori: sahna OSTIDA, ustida emas */}
              <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                {STATUS.map((x, i) => (
                  <div key={x.k} className={cn("flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-md sm:block", i === 2 ? "border-white bg-white/90 text-green-950" : "border-white/40 bg-white/20 text-white")}>
                    <dt className={cn("text-[11px] uppercase tracking-wider", i === 2 ? "text-green-900/70" : "text-white/75")}>{x.k}</dt>
                    <dd className="truncate text-[13px] font-semibold sm:mt-0.5">{x.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
