import { GUIDES } from "@/lib/guides";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

/** LLM'lar uchun barcha ommaviy qo'llanmalar bitta Markdown faylda (GEO). */
export function GET() {
  const parts = [`# ${SITE_NAME}\n\n> ${SITE_DESCRIPTION}\n\nSayt: ${SITE_URL}\n`];
  for (const g of GUIDES) {
    parts.push(`\n## ${g.h1}\n\nManba: ${SITE_URL}/${g.slug} (yangilangan ${g.updated})\n\n${g.answer}\n`);
    g.steps?.forEach((s, i) => parts.push(`${i + 1}. **${s.name}**: ${s.text}`));
    for (const s of g.sections) {
      parts.push(`\n### ${s.h}\n\n${s.p.join("\n\n")}`);
      s.list?.forEach((t) => parts.push(`- ${t}`));
    }
    if (g.faq.length) {
      parts.push(`\n### Savol-javob`);
      g.faq.forEach((f) => parts.push(`\n**${f.q}**\n${f.a}`));
    }
  }
  return new Response(parts.join("\n") + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
