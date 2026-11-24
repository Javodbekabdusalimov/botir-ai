import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Faqat ommaviy sahifalar; shaxsiy (dashboard, me, pay, haqiqiy live) kirmaydi. */
const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/assistant", priority: 0.8, changeFrequency: "monthly" },
  { path: "/live/demo-chorsu", priority: 0.7, changeFrequency: "monthly" },
  { path: "/connect", priority: 0.7, changeFrequency: "monthly" },
  { path: "/register", priority: 0.6, changeFrequency: "monthly" },
  { path: "/login", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
