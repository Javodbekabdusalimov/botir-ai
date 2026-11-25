import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo";

/** Narx rejalari: UI va JSON-LD uchun yagona manba. Hozir backend Pro uchun birinchi oy 1 000 so'm oladi. */
export const PRO_PRICE_UZS = 1000;
// Oylik narxlar (1-oydan keyin): egasi tasdiqlagan, 2026-11-25
export const BUSINESS_PRICE_UZS = 199_000;
export const PRO_AFTER_UZS = 499_000;
const som = (n: number) => n.toLocaleString("ru-RU").replace(/\s/g, " ");
/** "1-oy 1 000 so'm, keyin 499 000 so'm/oy" */
export const PRO_PRICE_COPY = `1-oy ${som(PRO_PRICE_UZS)} so'm, keyin ${som(PRO_AFTER_UZS)} so'm/oy`;
export const BUSINESS_PRICE_COPY = `${som(BUSINESS_PRICE_UZS)} so'm/oy`;
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
    a: "Siz yakuniy taklifni \"Tasdiqlayman\" tugmasi bilan tasdiqlaganingizdan keyingina to'lov havolasi ochiladi va pulni o'zingiz to'laysiz. To'lov TezCheck orqali qabul qilinadi: Payme, Click yoki Uzum. Hozir pilot: to'lovlar Life Assistant kassasiga tushadi, biznes bilan hisob-kitob alohida kelishiladi.",
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
    a: `Start tarifi bepul, Biznes ${BUSINESS_PRICE_COPY} (taklif), Pro ${PRO_PRICE_COPY}. Hech qaysi tarifda komissiya yo'q. Start 1 ta biznes agenti, katalog yuklash va Telegram ulashni beradi; Pro analitika va buyurtmalar panelini qo'shadi. Mijozlar uchun yordamchi bepul.`,
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
          { "@type": "Offer", name: "Start", price: "0", priceCurrency: "UZS" },
          {
            "@type": "Offer",
            name: "Pro",
            price: String(PRO_PRICE_UZS),
            priceCurrency: "UZS",
            priceSpecification: { "@type": "UnitPriceSpecification", price: String(PRO_PRICE_UZS), priceCurrency: "UZS", billingDuration: "P1M", unitText: "oy" },
          },
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
