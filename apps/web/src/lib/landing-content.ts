import { formatSom } from "./format";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo";

/**
 * Narx rejalari: UI, JSON-LD, FAQ va llms uchun yagona manba. Egasi tasdiqlagan, 2026-11-25; backend defaultlari bilan bir xil
 * (PLAN_INTRO_PRICE, PLAN_PRO_PRICE, PLAN_MAX_PRICE, PLAN_*_DAILY_TOKENS, PLAN_FREE_DAILY_REQUESTS). To'lov tugmasi narxni API'dan oladi.
 */
export const INTRO_PRICE_UZS = 1000;
export const PRO_PRICE_UZS = 82_000;
export const MAX_PRICE_UZS = 163_000;
export const PRO_DAILY_TOKENS = 100_000;
export const MAX_DAILY_TOKENS = 200_000;
export const FREE_DAILY_SEARCHES = 3;
const tokens = (n: number) => `${formatSom(n).replace(" so'm", "")} token/kun`;
/** "82 000 so'm/oy (1-oy 1 000 so'm)" */
export const PRO_PRICE_COPY = `${formatSom(PRO_PRICE_UZS)}/oy (1-oy ${formatSom(INTRO_PRICE_UZS)})`;
export const MAX_PRICE_COPY = `${formatSom(MAX_PRICE_UZS)}/oy (1-oy ${formatSom(INTRO_PRICE_UZS)})`;
export const FREE_COPY = `Free tarifi bepul (kuniga ${FREE_DAILY_SEARCHES} ta qidiruv)`;
export const PRO_TOKENS_COPY = tokens(PRO_DAILY_TOKENS);
export const MAX_TOKENS_COPY = tokens(MAX_DAILY_TOKENS);
/** Barcha tariflar bir gapda (FAQ, qo'llanmalar, llms). */
export const PLANS_COPY = `${FREE_COPY}, Pro ${formatSom(PRO_PRICE_UZS)}/oy (${PRO_TOKENS_COPY}), Max ${formatSom(MAX_PRICE_UZS)}/oy (${MAX_TOKENS_COPY}); Pro va Max uchun 1-oy ${formatSom(INTRO_PRICE_UZS)}`;
/** To'lov kimga tushadi: pul faqat KIRIM, hech kimga o'tkazma va'da qilinmaydi. */
export const PAYMENTS_COPY = "Obuna (Pro/Max) to'lovlari Life Assistant'ga tushadi. Buyurtma to'lovlari hozirgi versiyada TEST rejimida: haqiqiy pul yechilmaydi.";
export const MAX_ROUNDS_COPY = 3;

export interface FaqItem {
  q: string;
  /** Birinchi gap = to'g'ridan-to'g'ri javob (AEO), qolgani izoh. */
  a: string;
}

/** Savol-javoblar: ko'rinadigan bo'lim va FAQPage JSON-LD bir xil matnni ishlatadi. */
export const FAQ: FaqItem[] = [
  {
    q: "Life Assistant nima?",
    a: "Life Assistant: O'zbekiston bizneslari va mijozlari uchun AI agentlar tarmog'i, unda agent agent bilan gaplashadi, inson esa faqat yakuniy taklifni tasdiqlaydi. Biznes katalogini yuklaydi, AI sotuvchi esa Telegram xabariga darhol javob qoralamasini tayyorlaydi; autopilot rejimida ish vaqtida o'zi javob beradi. Mijoz esa shaxsiy yordamchiga so'rov yozadi, yordamchi bir nechta biznes bilan o'zi muzokara qiladi.",
  },
  {
    q: "Agentlar muzokarasi qanday ishlaydi?",
    a: "Muzokara ko'pi bilan 3 raund davom etadi: so'rov, taklif, qarshi taklif, bitim. Mijoz agenti so'rov va byudjetni aytadi, biznes agenti katalogdan taklif beradi, kerak bo'lsa chegirma bilan qarshi taklif qilinadi. Siz jarayonni /live ekranida jonli kuzatasiz va yakuniy taklifni ko'rib tasdiqlaysiz.",
  },
  {
    q: "Agent narxni o'zi to'qib chiqaradimi?",
    a: "Yo'q, narx faqat biznes katalogidan olinadi va chegirma biznes belgilagan maksimal foizdan oshmaydi. Bu qoida PolicyGuard tekshiruvi bilan majburlanadi: agent limitdan past narx taklif qila olmaydi.",
  },
  {
    q: "Pul qachon to'lanadi?",
    a: "Siz yakuniy taklifni \"Tasdiqlayman\" tugmasi bilan tasdiqlaganingizdan keyingina to'lov havolasi ochiladi va pulni o'zingiz to'laysiz. To'lov TezCheck orqali qabul qilinadi: Payme, Click yoki Uzum. " + PAYMENTS_COPY,
  },
  {
    q: "Telegram'ni qanday ulayman?",
    a: "Telegram'ni telefon raqam, SMS kod va kerak bo'lsa 2FA paroli orqali bir necha daqiqada ulaysiz. Agent mijozlar bilan sizning akkauntingiz orqali gaplashadi, sessiya shifrlanadi va istalgan payt uzishingiz mumkin.",
  },
  {
    q: "Ma'lumotlarim xavfsizmi?",
    a: "Ha: Telegram sessiyasi shifrlanadi, shaxsiy sahifalar qidiruv tizimlarida indekslanmaydi va agent sizning nomingizdan xabar yuborishdan oldin ruxsat so'raydi. Ishonchsiz holatda suhbat odamga yo'naltiriladi, agent o'zgarishlarini esa yaxshilash bo'limida tasdiqlaysiz yoki qaytarasiz.",
  },
  {
    q: "Life Assistant narxi qancha?",
    a: `${PLANS_COPY}. Hech qaysi tarifda komissiya yo'q. Free bizneslar va katalog narxlarini topadi; Pro va Max'da agent siz uchun savdolashadi, buyurtma beradi va Telegram ulanadi. Bizneslar ham shu Pro/Max tariflaridan foydalanadi.`,
  },
  {
    q: "Agent xato qilsa nima bo'ladi?",
    a: "Agent ishonchsiz bo'lsa, suhbat avtomatik ravishda sizga (odamga) yo'naltiriladi va pul hech qachon o'zboshimchalik bilan yechilmaydi. Agent ishini yaxshilash bo'limida taklif etilgan o'zgarishlarni ko'rib tasdiqlaysiz yoki bitta tugma bilan oldingi versiyaga qaytarasiz.",
  },
];

/** Landing JSON-LD: Organization, WebSite, SoftwareApplication, FAQPage (@graph). Faqat statik, ishonchli ma'lumot. */
export function landingJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon`,
        sameAs: ["https://github.com/Javodbekabdusalimov/botir-ai"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "uz",
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "uz",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#org` },
        offers: [
          { "@type": "Offer", name: "Free", price: "0", priceCurrency: "UZS", description: `Kuniga ${FREE_DAILY_SEARCHES} ta qidiruv` },
          ...([["Pro", PRO_PRICE_UZS, PRO_TOKENS_COPY], ["Max", MAX_PRICE_UZS, MAX_TOKENS_COPY]] as const).map(([name, price, perDay]) => ({
            "@type": "Offer",
            name,
            price: String(price),
            priceCurrency: "UZS",
            description: `${perDay}; 1-oy ${formatSom(INTRO_PRICE_UZS)}`,
            priceSpecification: { "@type": "UnitPriceSpecification", price: String(price), priceCurrency: "UZS", billingDuration: "P1M", unitText: "oy" },
          })),
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        inLanguage: "uz",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}
