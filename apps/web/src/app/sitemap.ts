import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Faqat ommaviy sahifalar; shaxsiy (dashboard, me, pay, haqiqiy live) kirmaydi. */
const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/assistant", priority: 0.8, changeFrequency: "monthly" },
  { path: "/live/demo-chorsu", priority: 0.7, changeFrequency: "monthly" },
  { path: "/qanday-ishlaydi", priority: 0.8, changeFrequency: "monthly" },
  { path: "/telegram-ai-sotuvchi", priority: 0.8, changeFrequency: "monthly" },
  { path: "/narxlar", priority: 0.7, changeFrequency: "monthly" },
  { path: "/savol-javob", priority: 0.7, changeFrequency: "monthly" },
  { path: "/biznes-avtomatlashtirish", priority: 0.8, changeFrequency: "monthly" },
  { path: "/arzon-narx-topish", priority: 0.8, changeFrequency: "monthly" },
  { path: "/ai-yordamchi", priority: 0.8, changeFrequency: "monthly" },
  { path: "/connect", priority: 0.7, changeFrequency: "monthly" },
  { path: "/register", priority: 0.6, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Har so'rovda yangi sana = soxta "yangilik" signali; kontent o'zgarganda shu sanani yangilang.
  const lastModified = new Date("2026-11-25");
  return PAGES.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
