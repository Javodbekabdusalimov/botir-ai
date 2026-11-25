import { MAX_ROUNDS_COPY, PRO_PRICE_COPY, type FaqItem } from "./landing-content";
import type { Guide } from "./guides";

/**
 * Qidiruv niyatlari bo'yicha SEO/GEO/AEO sahifalari: "biznes avtomatlashtirish", "arzon narxlarni topish", "AI yordamchi".
 * Har bo'lim savol shaklidagi H2 + birinchi gap = to'g'ridan-to'g'ri javob. Faqat mahsulotning haqiqiy imkoniyatlari.
 */
const UPDATED = "2026-11-25";

const AUTOMATION_FAQ: FaqItem[] = [
  {
    q: "Kichik biznesni qanday avtomatlashtirish mumkin?",
    a: "Kichik biznesni avtomatlashtirishning eng tez yo'li: takrorlanadigan savol-javob, narx aytish va buyurtma qabul qilishni AI sotuvchiga topshirish. Life Assistant'da katalogni Excel yoki CSV bilan yuklaysiz, Telegram'ni ulaysiz, AI esa mijoz xabariga katalog asosida javob tayyorlaydi va buyurtmani sizning tasdig'ingizga olib keladi.",
  },
  {
    q: "Biznes avtomatlashtirish qancha turadi?",
    a: `Life Assistant'da Start tarifi bepul, Pro ${PRO_PRICE_COPY}, sotuvdan komissiya olinmaydi. Dasturchi yollash yoki alohida CRM sotib olish shart emas: katalog va Telegram yetarli.`,
  },
  {
    q: "AI xato narx aytib qo'ymaydimi?",
    a: "Yo'q: AI narxni faqat sizning katalogingizdan oladi va chegirmani siz belgilagan maksimal foizdan oshira olmaydi. Ishonchsiz holatda suhbat sizga (odamga) yo'naltiriladi.",
  },
];

const CHEAP_FAQ: FaqItem[] = [
  {
    q: "Toshkentda arzon narxni qanday topsam bo'ladi?",
    a: `Life Assistant'ga nima kerakligini oddiy o'zbek tilida yozing: AI yordamchi mos joylarni topadi, har biri bilan ko'pi bilan ${MAX_ROUNDS_COPY} raund narx bo'yicha kelishadi va takliflarni narx bo'yicha tartiblab ko'rsatadi. Eng arzonini yoki reytingi yuqorisini o'zingiz tanlaysiz.`,
  },
  {
    q: "Narxlarni solishtirish bepulmi?",
    a: "Ha, mijozlar uchun AI yordamchi butunlay bepul. To'lov faqat siz tanlagan taklifni tasdiqlaganingizdan keyin, TezCheck orqali (Payme, Click, Uzum) amalga oshiriladi.",
  },
  {
    q: "Chegirma olish mumkinmi?",
    a: "Ha, agar biznes chegirmaga ruxsat bergan bo'lsa: mijoz agenti siz uchun savdolashadi, lekin chegirma biznes belgilagan limitdan oshmaydi. Shuning uchun taklif qilingan narx haqiqiy va bajariladigan narx bo'ladi.",
  },
];

const ASSISTANT_FAQ: FaqItem[] = [
  {
    q: "O'zbek tilida AI yordamchi bormi?",
    a: "Ha: Life Assistant o'zbek tilidagi erkin matnni tushunadigan AI yordamchi. Unga \"ertaga 6 kishilik joy band qil\" yoki \"mashinamni moy almashtirishga olib borishim kerak\" deb yozasiz, u mos joylarni topadi, narx va reytingni solishtiradi va siz uchun kelishadi.",
  },
  {
    q: "AI yordamchi nima qila oladi?",
    a: "AI yordamchi joy band qilish, xizmat yoki mahsulot narxini solishtirish, biznes bilan narx bo'yicha kelishish va to'lov havolasini tayyorlashni bajaradi. Pul faqat siz \"Tasdiqlayman\" tugmasini bosganingizdan keyin to'lanadi.",
  },
  {
    q: "AI yordamchidan foydalanish uchun nima kerak?",
    a: "Faqat brauzer: ro'yxatdan o'tish shart emas, so'rovni darhol yozishingiz mumkin. Buyurtmalar tarixini saqlash uchun telefon raqam bilan ro'yxatdan o'tasiz.",
  },
];

export const INTENT_GUIDES: Guide[] = [
  {
    slug: "biznes-avtomatlashtirish",
    title: "Biznesni avtomatlashtirish: AI sotuvchi va Telegram",
    h1: "Biznesni avtomatlashtirish: AI sotuvchi bilan",
    description: "Kichik biznesni avtomatlashtirish: AI sotuvchi Telegram mijozlariga katalog asosida javob beradi, buyurtmani tasdiqlashga olib keladi. Start bepul, komissiya yo'q.",
    answer: `Life Assistant kichik biznesni avtomatlashtiradi: katalogni yuklaysiz, Telegram'ni ulaysiz, AI sotuvchi mijoz savollariga katalog asosida o'zbekcha javob tayyorlaydi, narx bo'yicha kelishadi va buyurtmani sizning tasdig'ingizga olib keladi. Start bepul, Pro ${PRO_PRICE_COPY}, komissiya yo'q.`,
    sections: [
      {
        h: "Qaysi ishlar avtomatlashadi?",
        p: ["Eng ko'p vaqt oladigan takroriy ishlar avtomatlashadi: narx so'rovlariga javob, mavjudlikni aytish, joy yoki vaqt band qilish va buyurtma qabul qilish."],
        list: ["Narx va mavjudlik: katalogdan aniq javob", "Joy, stol yoki navbat band qilish", "Narx bo'yicha kelishuv (siz belgilagan chegirma ichida)", "To'lov havolasi: Payme, Click, Uzum (TezCheck)", "Bugungi qoldiq: sotilgan sari kamayadi"],
      },
      {
        h: "Qaysi bizneslarga mos?",
        p: ["Narxlari aniq bo'lgan har qanday kichik biznesga mos: oshxona va restoran, avtoservis, do'kon, go'zallik saloni, klinika. Asosiy shart: katalog (Excel yoki CSV) va Telegram akkaunt."],
      },
      {
        h: "Nazorat kimda qoladi?",
        p: ["Nazorat har doim biznes egasida: AI chegirma limitidan oshmaydi, ishonchsiz savolni sizga yo'naltiradi, agentni yaxshilash takliflarini esa siz tasdiqlaysiz yoki bitta tugma bilan qaytarasiz."],
      },
    ],
    faq: AUTOMATION_FAQ,
    cta: { href: "/register", label: "Biznesni bepul ulash" },
    updated: UPDATED,
  },
  {
    slug: "arzon-narx-topish",
    title: "Arzon narxlarni topish: AI narx solishtiradi va kelishadi",
    h1: "Arzon narxlarni qanday topish mumkin?",
    description: "Arzon narxlarni topish: AI yordamchi joylarni topadi, narx, reyting va masofani solishtiradi, siz uchun savdolashadi. Mijozlar uchun bepul.",
    answer: `Arzon narxni topish uchun Life Assistant'ga nima kerakligini yozing: AI yordamchi mos joylarni topadi, narx, reyting va masofani solishtiradi, har biri bilan ko'pi bilan ${MAX_ROUNDS_COPY} raund kelishadi va eng arzon taklifni ko'rsatadi. Mijozlar uchun bepul, to'lov faqat tasdiqdan keyin.`,
    sections: [
      {
        h: "AI narxlarni qanday solishtiradi?",
        p: ["AI har bir biznesning katalogidagi haqiqiy narxni oladi, so'rovingizga mos pozitsiyani tanlaydi va natijalarni narx, reyting va masofa bo'yicha taqqoslaydi. Uydirma narx bo'lmaydi: narx faqat katalogdan."],
        list: ["Eng arzon: eng past narxli taklif", "Eng yuqori reyting: yulduzlari ko'p joy", "Eng yaqin: masofasi kam joy"],
      },
      {
        h: "Savdolashish qanday ishlaydi?",
        p: ["Shaxsiy agentingiz biznes agenti bilan siz uchun gaplashadi: so'rov, taklif, qarshi taklif, bitim. Chegirma biznes ruxsat bergan limit ichida bo'ladi, shuning uchun kelishilgan narx bajariladi."],
      },
      {
        h: "Qaysi xizmatlar uchun ishlaydi?",
        p: ["Platformadagi har qanday biznes uchun: osh va restoran, avtoservis (moy almashtirish, diagnostika), do'kon mahsulotlari va boshqa xizmatlar. Bizneslar soni ko'paygan sari tanlov ham kengayadi."],
      },
    ],
    faq: CHEAP_FAQ,
    cta: { href: "/assistant", label: "Narxlarni solishtirish" },
    updated: UPDATED,
  },
  {
    slug: "ai-yordamchi",
    title: "AI yordamchi o'zbek tilida: joy band qiladi, narx topadi",
    h1: "O'zbek tilidagi AI yordamchi",
    description: "O'zbek tilidagi AI yordamchi: joy band qiladi, narx va reytingni solishtiradi, biznes bilan siz uchun kelishadi. Bepul, to'lov faqat tasdiqdan keyin.",
    answer: "Life Assistant: o'zbek tilidagi bepul AI yordamchi. Unga oddiy so'z bilan yozasiz, masalan \"bugun mashinamni servisga olib borishim kerak\", u mos joylarni topadi, narx, reyting va egasini ko'rsatadi, siz uchun kelishadi va to'lov havolasini tayyorlaydi. Pul faqat sizning tasdig'ingizdan keyin.",
    sections: [
      {
        h: "AI yordamchiga nima deb yozish mumkin?",
        p: ["Kundalik ishingizni oddiy o'zbek tilida yozasiz: AI niyatni o'zi tushunadi, kategoriyani aniqlaydi va mos joylarni tanlaydi."],
        list: ["\"Ertaga 18:00 ga 6 kishilik osh joy band qil\"", "\"Mashinamga moy almashtirish kerak, arzonini top\"", "\"Uyga 2 kg go'sht va non kerak\""],
      },
      {
        h: "Oddiy chatbotdan farqi nima?",
        p: ["Oddiy chatbot faqat ma'lumot beradi, Life Assistant esa ishni oxirigacha bajaradi: joylarni topadi, solishtiradi, biznes agenti bilan kelishadi va tasdiqlaganingizdan keyin buyurtmani yuboradi."],
      },
      {
        h: "Ma'lumotlarim xavfsizmi?",
        p: ["Ha: agent sizning nomingizdan pul to'lay olmaydi, har bir to'lov sizning tasdig'ingiz bilan TezCheck orqali bo'ladi. Shaxsiy sahifalar qidiruv tizimlarida indekslanmaydi."],
      },
    ],
    faq: ASSISTANT_FAQ,
    cta: { href: "/assistant", label: "AI yordamchini sinash" },
    updated: UPDATED,
  },
];
