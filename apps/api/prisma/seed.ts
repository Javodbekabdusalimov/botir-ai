import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const FULL_DAY: [string, string] = ['09:00', '22:00'];
const WORK_DAY: [string, string] = ['09:00', '19:00'];

const openEveryDay = (hours: [string, string]): Prisma.InputJsonValue => ({
  mon: hours,
  tue: hours,
  wed: hours,
  thu: hours,
  fri: hours,
  sat: hours,
  sun: hours,
});

const closedSunday = (hours: [string, string]): Prisma.InputJsonValue => ({
  mon: hours,
  tue: hours,
  wed: hours,
  thu: hours,
  fri: hours,
  sat: hours,
  sun: null,
});

async function main(): Promise<void> {
  const owner = await prisma.user.upsert({
    where: { tgId: 'demo-owner' },
    update: {},
    create: { tgId: 'demo-owner', name: 'Demo Egasi', lang: 'uz' },
  });

  const customer = await prisma.user.upsert({
    where: { tgId: 'demo-customer' },
    update: {},
    create: { tgId: 'demo-customer', name: 'Ali', lang: 'uz' },
  });

  const oshMarkazi = await prisma.business.create({
    data: {
      name: 'Chilonzor Osh Markazi',
      category: 'restaurant',
      address: 'Chilonzor 9-kvartal',
      district: 'Chilonzor',
      workHours: openEveryDay(FULL_DAY),
      maxDiscountPct: 10,
      lang: 'uz',
      ownerUserId: owner.id,
      isDemo: true,
      catalogItems: {
        create: [
          { name: 'Osh (porsiya)', price: 35_000, unit: 'porsiya', tags: ['osh', 'milliy'] },
          { name: 'Stol 6 kishilik', price: 210_000, unit: 'stol', durationMin: 120, tags: ['stol', 'bron', '6'] },
          { name: 'Stol 8 kishilik', price: 280_000, unit: 'stol', durationMin: 120, tags: ['stol', 'bron', '8'] },
          { name: 'Stol 10 kishilik', price: 350_000, unit: 'stol', durationMin: 120, tags: ['stol', 'bron', '10'] },
          { name: 'Shashlik', price: 28_000, unit: 'dona', tags: ['shashlik', 'goshtli'] },
          { name: 'Achchiq-chuchuk salat', price: 18_000, unit: 'porsiya', tags: ['salat'] },
        ],
      },
    },
  });

  const autoService = await prisma.business.create({
    data: {
      name: 'Chilonzor AutoService',
      category: 'autoservice',
      address: "Chilonzor, Bunyodkor shoh ko'chasi 12",
      district: 'Chilonzor',
      workHours: closedSunday(WORK_DAY),
      maxDiscountPct: 5,
      lang: 'uz',
      ownerUserId: owner.id,
      isDemo: true,
      catalogItems: {
        create: [
          { name: 'Moy almashtirish', price: 120_000, unit: 'xizmat', durationMin: 45, tags: ['moy', 'servis'] },
          { name: 'Kompyuter diagnostikasi', price: 90_000, unit: 'xizmat', durationMin: 60, tags: ['diagnostika'] },
          { name: 'Shina almashtirish (4 ta)', price: 80_000, unit: 'xizmat', durationMin: 40, tags: ['shina'] },
          { name: 'Tormoz kolodkasi almashtirish', price: 150_000, unit: 'xizmat', durationMin: 90, tags: ['tormoz'] },
        ],
      },
    },
  });

  const miniMarket = await prisma.business.create({
    data: {
      name: 'Mini Market',
      category: 'shop',
      address: 'Chilonzor 19-kvartal',
      district: 'Chilonzor',
      workHours: openEveryDay(['08:00', '23:00']),
      maxDiscountPct: 0,
      lang: 'uz',
      ownerUserId: owner.id,
      isDemo: true,
      catalogItems: {
        create: [
          { name: 'Non', price: 4_000, unit: 'dona', tags: ['non'] },
          { name: 'Sut 1 l', price: 14_000, unit: 'dona', tags: ['sut'] },
          { name: 'Tuxum (10 dona)', price: 22_000, unit: 'paket', tags: ['tuxum'] },
          { name: 'Guruch 1 kg', price: 18_000, unit: 'kg', tags: ['guruch'] },
          { name: 'Yogʻ 1 l', price: 26_000, unit: 'dona', tags: ['yog'] },
          { name: 'Shakar 1 kg', price: 13_000, unit: 'kg', tags: ['shakar'] },
          { name: 'Choy 100 g', price: 16_000, unit: 'dona', tags: ['choy'] },
          { name: 'Makaron 400 g', price: 11_000, unit: 'dona', tags: ['makaron'] },
          { name: 'Konserva', price: 21_000, unit: 'dona', tags: ['konserva'] },
          { name: 'Suv 1.5 l', price: 5_000, unit: 'dona', tags: ['suv'] },
          { name: 'Pechene', price: 9_000, unit: 'dona', tags: ['shirinlik'] },
          { name: 'Qahva 100 g', price: 32_000, unit: 'dona', tags: ['qahva'] },
        ],
      },
    },
  });

  // One connected Telegram account with a demo chat, so the inbox screen is not empty.
  const tgAccount = await prisma.tgAccount.create({
    data: {
      businessId: oshMarkazi.id,
      mode: 'userbot',
      phone: '+998900000000',
      status: 'connected',
    },
  });

  const chat = await prisma.chat.create({
    data: {
      tgAccountId: tgAccount.id,
      peerId: 'demo-peer-1',
      title: 'Ali',
      mode: 'copilot',
      lastMessageText: 'Ertaga 6 kishiga stol bormi?',
      needsHuman: true,
      unread: 1,
    },
  });

  await prisma.tgMessage.createMany({
    data: [
      {
        chatId: chat.id,
        direction: 'in',
        author: 'customer',
        text: 'Salom! Ertaga kechqurun 6 kishiga stol bormi?',
      },
      {
        chatId: chat.id,
        direction: 'out',
        author: 'ai',
        text: "Salom! Ertaga 19:00 ga 6 kishilik stol bor — 210 000 so'm. Band qilaymi?",
        isDraft: true,
      },
    ],
  });

  await prisma.memoryFact.create({
    data: {
      subjectType: 'customer',
      subjectId: customer.id,
      businessId: oshMarkazi.id,
      fact: 'Ali oshni yaxshi koradi, Chilonzorda yashaydi',
      source: 'seed',
      confidence: 0.9,
    },
  });

  const counts = {
    businesses: 3,
    ids: [oshMarkazi.id, autoService.id, miniMarket.id],
  };
  process.stdout.write(`seeded ${counts.businesses} demo businesses: ${counts.ids.join(', ')}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`seed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
