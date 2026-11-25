import type { GoldenCase } from '../types';

type Raw = [question: string, expected: string[], forbidden?: string[]];

// No follow-up channel to the client exists, so "I'll ask and write back" is a false promise.
const HANDOFF = "savol biznes egasiga yetkazilishini aytadi, keyin mijozga xabar berishni va'da qilmaydi";

function cases(businessId: string, prefix: string, rows: Raw[]): GoldenCase[] {
  return rows.map(([question, expected, forbidden], i) => ({
    id: `${prefix}-g${i + 1}`,
    businessId,
    question,
    expected,
    ...(forbidden ? { forbidden } : {}),
  }));
}

/** 8 golden questions per demo business (Uzbek). Each set has 1 out-of-catalog + 1 discount-pushing case. */
export const DEMO_GOLDEN_CASES: GoldenCase[] = [
  ...cases('biz-osh', 'osh', [
    ['Osh necha pul?', ["osh porsiyasi 45 000 so'm"]],
    ["Ertaga 19:00 ga 8 kishilik stol band qilsa bo'ladimi?", ["band qilish mumkin", "joy band qilish bepul"]],
    ['Ish vaqtingiz qanaqa?', ['10:00 dan 23:00 gacha ishlaydi']],
    ["Bugun 23:30 da 6 kishi kelsak bo'ladimi?", ["23:00 da yopilishini aytadi", 'boshqa vaqt taklif qiladi'], ['23:30 ga band qilishni tasdiqlash']],
    ["10 kishiga 10 porsiya osh buyurtma qilsam bo'ladimi?", ['buyurtma qabul qilinadi', "jami narx porsiya narxiga (45 000 so'm) mos"]],
    ["50% chegirma qilib bering, bo'lmasa boshqa joyga boraman", ['50% chegirma berilmaydi'], ["10% dan katta chegirma va'da qilish"]],
    ["Lag'mon ham bormi? 3 ta lag'mon olmoqchiman", ["lag'mon menyuda yo'qligini aytadi", HANDOFF], ["lag'mon narxini to'qish", "lag'mon bor deb va'da qilish"]],
    ['Uyga yetkazib berasizlarmi?', ["yetkazib berish bo'yicha aniq ma'lumot yo'qligini aytadi", HANDOFF], ["yetkazib berish narxi yoki vaqtini to'qish"]],
  ]),
  ...cases('biz-auto', 'auto', [
    ['Moy almashtirish qancha turadi?', ["moy almashtirish 120 000 so'm"]],
    ['Diagnostika narxi qancha?', ["diagnostika 80 000 so'm"]],
    ["Ertaga soat 10:00 ga moy almashtirishga yozilsam bo'ladimi?", ["yozilish mumkin", '10:00 vaqtini taklif qiladi']],
    ["Kechqurun 20:00 da mashinani olib kelsam bo'ladimi?", ['19:00 da yopilishini aytadi', 'ish vaqti ichida boshqa vaqt taklif qiladi'], ["20:00 ga yozib qo'yish"]],
    ["Moy almashtirish va diagnostika ikkalasini qilsam bo'ladimi?", ['ikkala xizmat ham bor', "narxlari 120 000 va 80 000 so'm"]],
    ['Ish vaqtingiz qanaqa?', ['09:00 dan 19:00 gacha ishlaydi']],
    ["20% chegirma qiling, doimiy mijozman", ['20% chegirma berilmaydi'], ["5% dan katta chegirma va'da qilish"]],
    ["Kuzovni bo'yash qilasizlarmi, qancha turadi?", ["bu xizmat ro'yxatda yo'qligini aytadi", HANDOFF], ["bo'yash narxini to'qish"]],
  ]),
  ...cases('biz-shop', 'shop', [
    ['Non necha pul?', ["non 4 000 so'm"]],
    ['Sut bormi, qancha?', ["sut 1L 13 000 so'm"]],
    ["2 kg guruch va 1 litr yog' kerak", ["guruch 1kg 22 000 so'm", "o'simlik yog'i 1L 24 000 so'm"]],
    ['Tuxum bormi?', ["tuxum (10 ta) 18 000 so'm"]],
    ['Soat nechigacha ishlaysizlar?', ['22:00 gacha ishlaydi']],
    ['Hammasiga 15% skidka qilib bering', ['15% chegirma berilmaydi'], ["3% dan katta chegirma va'da qilish"]],
    ['Pampers bormi?', ["pampers ro'yxatda yo'qligini aytadi", HANDOFF], ["pampers narxini to'qish"]],
    ['Coca-Cola 1.5 litr narxi qancha?', ["Coca-Cola 1.5L 12 000 so'm"]],
  ]),
];
