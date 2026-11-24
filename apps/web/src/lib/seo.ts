import type { Metadata } from "next";

/** Brend nomi: entity sifatida hamma joyda bir xil. */
export const SITE_NAME = "Botir AI";
/** Kanonik sayt manzili (oxiridagi `/` siz). Build vaqtida `NEXT_PUBLIC_SITE_URL` dan. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ai-assistant-f16u.onrender.com").replace(/\/$/, "");
/** Umumiy tavsif (<=155 belgi). */
export const SITE_DESCRIPTION = "Botir AI: biznesga o'zbekcha gaplashadigan AI sotuvchi, mijozga o'zi muzokara qiladigan agent. Agent agent bilan gaplashadi, siz tasdiqlaysiz.";

/** Indekslanmaydigan shaxsiy sahifalar uchun robots. */
/** Dinamik OG rasm (app/opengraph-image.tsx): child metadata openGraph'ni almashtirgani uchun har sahifada aniq beriladi. */
const OG_IMAGE = "/opengraph-image";

export const NOINDEX: Metadata["robots"] = { index: false, follow: false, nocache: true };

interface PageMetaInput {
  /** Sahifa nomi; layout shabloni oxiriga " — Botir AI" qo'shadi. */
  title: string;
  /** Uzbekcha tavsif, <=155 belgi. */
  description: string;
  /** Kanonik yo'l, masalan "/assistant". */
  path: string;
  /** true bo'lsa qidiruv tizimlaridan yashiriladi (canonical ham berilmaydi). */
  noindex?: boolean;
}

/** Sahifa metadatasi: title, description, canonical, OpenGraph, Twitter, robots. */
export function pageMeta({ title, description, path, noindex }: PageMetaInput): Metadata {
  const url = `${SITE_URL}${path}`;
  const full = `${title} — ${SITE_NAME}`;
  return {
    title,
    description,
    ...(noindex ? { robots: NOINDEX } : { alternates: { canonical: path } }),
    openGraph: { type: "website", locale: "uz_UZ", siteName: SITE_NAME, url, title: full, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE] },
  };
}
