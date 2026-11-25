import { BUSINESS_PRICE_COPY, FAQ, MAX_ROUNDS_COPY, PRO_PRICE_COPY, type FaqItem } from "./landing-content";
import { SITE_NAME, SITE_URL } from "./seo";
import { INTENT_GUIDES } from "./guides-intent";

/**
 * Ommaviy SEO/GEO/AEO sahifalari (statik, server render). Har bo'lim: savol shaklidagi H2 + birinchi gap = to'g'ridan-to'g'ri javob
 * (AI javob mashinalari shu gapni iqtibos qiladi). Faqat mahsulotning haqiqiy qoidalari, uydirma raqam yo'q.
 */
export interface GuideSection {
  h: string;
  /** Birinchi paragraf = qisqa javob (40-60 so'z). */
  p: string[];
  list?: string[];
}

export interface Guide {
  slug: string;
  /** <title> (layout " — Life Assistant" qo'shadi). */
  title: string;
  h1: string;
  description: string;
  /** Sahifa tepasidagi "Qisqa javob" bloki (TL;DR). */
  answer: string;
  sections: GuideSection[];
  faq: FaqItem[];
  /** HowTo qadamlari (faqat qanday-ishlaydi). */
  steps?: { name: string; text: string }[];
  cta: { href: string; label: string };
  updated: string;
}

const UPDATED = "2026-11-24";

export const GUIDES: Guide[] = [
  {
    slug: "qanday-ishlaydi",
    title: "Life Assistant qanday ishlaydi: 4 qadam",
    h1: "Life Assistant qanday ishlaydi?",
    description: `Life Assistant 4 qadamda ishlaydi: biznes katalogni yuklaydi, mijoz so'rov yozadi, agentlar ${MAX_ROUNDS_COPY} raundgacha muzokara qiladi, siz yakuniy taklifni tasdiqlaysiz.`,
    answer: `Life Assistant 4 qadamda ishlaydi: biznes katalogini (Excel/CSV) yuklaydi, mijoz so'rov yozadi, mijozning shaxsiy agenti biznes agenti bilan ko'pi bilan ${MAX_ROUNDS_COPY} raund muzokara qiladi, inson esa yakuniy taklifni bitta tugma bilan tasdiqlaydi. Pul faqat tasdiqdan keyin TezCheck orqali (Payme, Click, Uzum) qabul qilinadi.`,
    steps: [
      { name: "Biznesni ulang", text: "Biznes nomi, tuman, ish vaqti va maksimal chegirma foizini kiriting, katalogni Excel yoki CSV faylda yuklang. Telegram akkauntni SMS kod bilan ulang." },
      { name: "So'rov yozing", text: "Mijoz shaxsiy yordamchiga oddiy o'zbek tilida yozadi, masalan: \"Ertaga 18:00 ga 6 kishilik osh joy band qil, byudjet 600 ming\"." },
      { name: "Agentlar muzokara qiladi", text: `Mijoz agenti mos bizneslarni topadi va ular bilan ko'pi bilan ${MAX_ROUNDS_COPY} raund gaplashadi: so'rov, taklif, qarshi taklif, bitim. Jarayonni /live ekranida jonli ko'rasiz.` },
      { name: "Tasdiqlang va to'lang", text: "Yakuniy taklifni ko'rib \"Tasdiqlayman\" tugmasini bosasiz. To'lov havolasi TezCheck orqali ochiladi: Payme, Click yoki Uzum." },
    ],
    sections: [
      {
        h: "Agentlar nima haqida kelishadi?",
        p: ["Agentlar narx, miqdor, vaqt va yetkazish shartlari haqida kelishadi. Narx faqat biznes katalogidan olinadi, chegirma esa biznes belgilagan maksimal foizdan oshmaydi: buni PolicyGuard tekshiruvi har bir taklifda majburlaydi."],
      },
      {
        h: "Inson qayerda qaror qiladi?",
        p: ["Yakuniy qarorni har doim inson qiladi: agent pulni o'zi yecha olmaydi. Agent ishonchsiz bo'lsa yoki savol katalogdan tashqarida bo'lsa, suhbat avtomatik ravishda biznes egasiga yo'naltiriladi."],
        list: ["Mijoz: yakuniy taklifni tasdiqlaydi yoki rad etadi", "Biznes: chegirma limiti, katalog va agent o'zgarishlarini tasdiqlaydi", "Tizim: faqat kirim to'lovlarini qabul qiladi, qaytarish yoki chiqarish yo'q"],
      },
      {
        h: "Muzokara qancha vaqt oladi?",
        p: [`Muzokara odatda bir necha soniyadan bir daqiqagacha davom etadi, chunki raundlar soni ${MAX_ROUNDS_COPY} bilan cheklangan. Natija: bitim yoki asosli rad, cheksiz savdolashuv bo'lmaydi.`],
      },
    ],
    faq: [FAQ[1], FAQ[2], FAQ[3]],
    cta: { href: "/live/demo-chorsu", label: "Jonli muzokarani ko'rish" },
    updated: UPDATED,
  },
  {
    slug: "telegram-ai-sotuvchi",
    title: "Telegram uchun AI sotuvchi: o'zbekcha, darhol javob",
    h1: "Telegram uchun AI sotuvchi: mijozlarga o'zbek tilida darhol javob",
    description: "Life Assistant: Telegram mijozlariga o'zbek tilida darhol javob qoralamasini tayyorlaydigan AI sotuvchi. Narx katalogdan, chegirma limitda, buyurtma sizning tasdig'ingiz bilan.",
    answer: "Life Assistant: Telegram akkauntingizga ulanadigan AI sotuvchi, u Telegram xabariga darhol javob qoralamasini tayyorlaydi (autopilot rejimida ish vaqtida o'zi javob beradi), narxni faqat katalogingizdan aytadi va chegirmani siz belgilagan limitdan oshirmaydi. Start tarifi bepul, Pro " + PRO_PRICE_COPY + ", hech qaysi tarifda komissiya yo'q.",
    sections: [
      {
        h: "AI sotuvchi qaysi bizneslarga mos?",
        p: ["Telegram orqali buyurtma oladigan har qanday kichik biznesga mos: oshxona va kafe, do'kon, ulgurji savdo, go'zallik saloni, servis. Asosiy shart: narxlari aniq katalog (Excel yoki CSV) bo'lishi."],
        list: ["Oshxona va to'yxona: joy band qilish, menyu va narx", "Do'kon va ulgurji: mavjudlik, narx, yetkazish", "Xizmatlar: vaqt band qilish va narx kelishuvi"],
      },
      {
        h: "Oddiy chatbotdan farqi nima?",
        p: ["Oddiy chatbot tugmalar va tayyor javoblar bilan ishlaydi, Life Assistant esa erkin o'zbek tilidagi xabarni tushunadi va mijoz agenti bilan narx bo'yicha muzokara qiladi. Shu bilan birga u katalogdan tashqariga chiqmaydi va pulni inson tasdig'isiz qabul qilmaydi."],
      },
      {
        h: "Ulash qancha vaqt oladi?",
        p: ["Ulash odatda 5 daqiqadan kam vaqt oladi: ro'yxatdan o'tasiz, katalogni yuklaysiz, Telegram'ni telefon raqam va SMS kod bilan ulaysiz. Sessiya shifrlanadi va istalgan payt uziladi."],
      },
      {
        h: "To'lov qanday qabul qilinadi?",
        p: ["To'lov TezCheck orqali Payme, Click yoki Uzum havolasi bilan qabul qilinadi Hozir pilot: to'lovlar Life Assistant kassasiga tushadi, biznes bilan hisob-kitob alohida kelishiladi. Havola faqat mijoz yakuniy taklifni tasdiqlagandan keyin yuboriladi."],
      },
    ],
    faq: [FAQ[4], FAQ[5], FAQ[7]],
    cta: { href: "/register", label: "Biznesni bepul ulash" },
    updated: UPDATED,
  },
  {
    slug: "narxlar",
    title: "Narxlar: Start bepul, Pro " + PRO_PRICE_COPY,
    h1: "Life Assistant narxlari",
    description: `Life Assistant narxi: Start tarifi bepul, Pro ${PRO_PRICE_COPY}, komissiya yo'q. Mijozlar uchun shaxsiy yordamchi bepul.`,
    answer: `Life Assistant Start tarifi bepul, Biznes ${BUSINESS_PRICE_COPY} (tez orada), Pro ${PRO_PRICE_COPY}. Hech qaysi tarifda komissiya yo'q. Mijozlar uchun shaxsiy AI yordamchi butunlay bepul.`,
    sections: [
      {
        h: "Start tarifida nima bor?",
        p: ["Start tarifi bepul va boshlash uchun yetarli: 1 ta biznes agenti, katalog yuklash (Excel/CSV), Telegram ulash va agentlar muzokarasi."],
      },
      {
        h: "Pro tarifi nima qo'shadi?",
        p: [`Pro tarifi: ${PRO_PRICE_COPY}. Qo'shimcha: analitika va buyurtmalar paneli, agentni yaxshilash takliflari (o'zgarishni siz tasdiqlaysiz). Biznes tarifi (${BUSINESS_PRICE_COPY}) tez orada.`],
      },
      {
        h: "Yashirin to'lovlar bormi?",
        p: ["Yo'q: hech qaysi tarifda sotuvdan foiz yoki komissiya olinmaydi. To'lov TezCheck orqali qabul qilinadi. Hozir pilot: to'lovlar Life Assistant kassasiga tushadi, biznes bilan hisob-kitob alohida kelishiladi."],
      },
    ],
    faq: [FAQ[6], FAQ[3]],
    cta: { href: "/register", label: "Bepul boshlash" },
    updated: UPDATED,
  },
  {
    slug: "savol-javob",
    title: "Savol-javob: Life Assistant haqida hammasi",
    h1: "Life Assistant haqida savol-javob",
    description: "Life Assistant haqida eng ko'p beriladigan savollar: agentlar qanday muzokara qiladi, narx qayerdan olinadi, pul qachon to'lanadi, Telegram qanday ulanadi.",
    answer: "Life Assistant: O'zbekiston bizneslari va mijozlari uchun AI agentlar tarmog'i, unda agent agent bilan gaplashadi va inson faqat yakuniy taklifni tasdiqlaydi. Quyida eng ko'p so'raladigan savollarga qisqa javoblar.",
    sections: [],
    faq: FAQ,
    cta: { href: "/assistant", label: "Yordamchini sinash" },
    updated: UPDATED,
  },
  ...INTENT_GUIDES,
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Guide JSON-LD: WebPage + BreadcrumbList + FAQPage (+ HowTo). */
export function guideJsonLd(g: Guide): Record<string, unknown> {
  const url = `${SITE_URL}/${g.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: g.h1,
      description: g.description,
      inLanguage: "uz",
      dateModified: g.updated,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
      speakable: { "@type": "SpeakableSpecification", cssSelector: ["#tldr", "h1"] },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: g.h1, item: url },
      ],
    },
  ];
  if (g.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      inLanguage: "uz",
      mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  if (g.steps) {
    graph.push({
      "@type": "HowTo",
      "@id": `${url}#howto`,
      name: g.h1,
      description: g.answer,
      inLanguage: "uz",
      totalTime: "PT5M",
      step: g.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text, url: `${url}#qadam-${i + 1}` })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
