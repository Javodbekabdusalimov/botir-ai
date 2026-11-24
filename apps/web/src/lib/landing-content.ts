import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo";

/** Narx rejalari: UI va JSON-LD (SoftwareApplication.offers) uchun yagona manba. Pro narxi o'zgarmaydi: 1 000 so'm/oy. */
export const PRO_PRICE_UZS = 1000;
export const MAX_ROUNDS_COPY = 3;

export interface FaqItem {
  q: string;
  /** Birinchi gap = to'g'ridan-to'g'ri javob (AEO), qolgani izoh. */
  a: string;
}

/** Savol-javoblar: ko'rinadigan bo'lim va FAQPage JSON-LD bir xil matnni ishlatadi. */
export const FAQ: FaqItem[] = [
  {
    q: "Botir AI nima?",
    a: "Botir AI: O'zbekiston bizneslari va mijozlari uchun AI agentlar tarmog'i, unda agent agent bilan gaplashadi, inson esa faqat yakuniy taklifni tasdiqlaydi. Biznes katalogini yuklaydi va AI sotuvchi Telegram'da mijozlar bilan o'zbek tilida 24/7 gaplashadi. Mijoz esa shaxsiy yordamchiga so'rov yozadi, yordamchi bir nechta biznes bilan o'zi muzokara qiladi.",
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
    q: "Pul qachon yechiladi?",
    a: "Pul faqat siz yakuniy taklifni \"Tasdiqlayman\" tugmasi bilan tasdiqlaganingizdan keyin yechiladi. To'lov TezCheck orqali qabul qilinadi: Payme, Click yoki Uzum. Tizim faqat kirim to'lovlarini qabul qiladi, qaytarish yoki chiqarish amallari yo'q.",
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
    q: "Botir AI narxi qancha?",
    a: `Start tarifi bepul, Pro tarifi oyiga ${PRO_PRICE_UZS.toLocaleString("ru-RU").replace(/ /g, " ")} so'm turadi va sotuvdan komissiya olinmaydi. Start 1 ta biznes agenti, katalog yuklash, Telegram ulash va oyiga 100 tagacha suhbatni beradi. Pro 10 barobar ko'p AI kredit, autopilot va analitikani qo'shadi. Mijozlar uchun yordamchi bepul.`,
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
