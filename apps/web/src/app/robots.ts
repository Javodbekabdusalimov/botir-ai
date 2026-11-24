import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Shaxsiy yo'llar qidiruvdan yopiladi; AI crawlerlarga ommaviy sahifalar ochiq. */
const PRIVATE_PATHS = ["/dashboard", "/me/", "/pay/", "/connect/telegram", "/api/"];
const AI_CRAWLERS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt"], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
