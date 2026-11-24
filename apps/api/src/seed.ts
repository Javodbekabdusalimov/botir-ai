// Idempotent demo seed: the same 3 businesses + catalog as agents/store/seed.ts. Run: pnpm --filter api db:seed
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { WorkHours } from '@botir/shared';
import { DEMO_BUSINESSES, DEMO_GOLDEN_CASES, DEMO_PRODUCTS } from './agents';
import { hashPassword } from './auth/auth.util';

const ADDRESS: Record<string, string> = {
  'biz-osh': 'Chilonzor tumani, Bunyodkor shoh ko‘chasi',
  'biz-auto': 'Chilonzor tumani, Qatortol ko‘chasi',
  'biz-shop': 'Chilonzor tumani, 9-kvartal',
};

async function main(): Promise<void> {
  const db = new PrismaClient();
  const logger = new Logger('Seed');
  for (const b of DEMO_BUSINESSES) {
    const day: [string, string] = [b.hours.open, b.hours.close];
    const workHours: WorkHours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
    const data = {
      name: b.name, category: b.category, district: b.area, address: ADDRESS[b.id] ?? b.area,
      workHours: JSON.stringify(workHours), maxDiscountPct: b.maxDiscountPct, lang: 'uz', isDemo: true, notes: b.notes ?? null,
    };
    await db.business.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
  }
  for (const p of DEMO_PRODUCTS) {
    const data = { businessId: p.businessId, name: p.name, price: p.price, unit: p.unit };
    await db.catalogItem.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const g of DEMO_GOLDEN_CASES) {
    const data = { businessId: g.businessId, question: g.question, expected: JSON.stringify(g.expected), forbidden: g.forbidden ? JSON.stringify(g.forbidden) : null };
    await db.goldenCase.upsert({ where: { id: g.id }, create: { id: g.id, ...data }, update: data });
  }
  // Test accounts (README): business owner of biz-osh + a plain user ("demo-user" = web's default userId).
  const TEST_USERS = [
    { id: 'owner-biz-osh', name: 'Chilonzor Osh Markazi egasi', phone: '+998900000001', role: 'business', businessId: 'biz-osh' },
    { id: 'demo-user', name: 'Demo foydalanuvchi', phone: '+998900000002', role: 'user', businessId: null },
  ];
  for (const u of TEST_USERS) {
    const data = { name: u.name, role: u.role, businessId: u.businessId, passwordHash: hashPassword('botir123'), deletedAt: null };
    await db.user.upsert({ where: { phone: u.phone }, create: { id: u.id, phone: u.phone, ...data }, update: data });
  }
  await seedDemoOwnerData(db);
  logger.log(`seeded ${TEST_USERS.length} test users, ${DEMO_BUSINESSES.length} businesses, ${DEMO_PRODUCTS.length} catalog items, ${DEMO_GOLDEN_CASES.length} golden cases, demo inbox + findings`);
  await db.$disconnect();
}

/**
 * Demo owner data for biz-osh so the cabinet is not empty without a real Telegram login:
 * a sample inbox chat (kind 'demo', no session → status stays "not connected", sending is refused)
 * and auditor findings that /loop/run ("Yaxshilash") can work on. Fixed ids → idempotent.
 */
async function seedDemoOwnerData(db: PrismaClient): Promise<void> {
  const accountId = 'demo-tg-biz-osh';
  const acc = { ownerType: 'business', businessId: 'biz-osh', kind: 'demo', tgUserId: '0', username: 'namuna', connectedAt: new Date(), deletedAt: null };
  await db.tgAccount.upsert({ where: { id: accountId }, create: { id: accountId, ...acc }, update: acc });

  const base = Date.now() - 20 * 60_000;
  const chats = [
    {
      id: 'demo-chat-1', title: 'Aziza (namuna)', mode: 'copilot', needsHuman: false,
      draft: { text: "Assalomu alaykum! Ha, ertaga 19:00 ga 4 kishilik joy bor. Osh 1 porsiya 45 000 so'm. Band qilib qo'yaymi?", confidence: 0.86, needsHuman: false },
      msgs: [
        ['in', 'Aziza', 'Assalomu alaykum, ertaga kechqurun 4 kishiga joy bormi?'],
        ['in', 'Aziza', "Soat 19:00 atrofida. Osh narxi qancha?"],
      ],
    },
    {
      id: 'demo-chat-2', title: 'Sardor (namuna)', mode: 'copilot', needsHuman: true, draft: undefined,
      msgs: [
        ['in', 'Sardor', "Kecha olgan oshim sovuq keldi, pulimni qaytarasizlarmi?"],
      ],
    },
  ] as const;
  for (const [ci, c] of chats.entries()) {
    const last = new Date(base + (ci === 0 ? 15 : 5) * 60_000);
    const draft = c.draft ? JSON.stringify({ ...c.draft, createdAt: last.toISOString() }) : null;
    const data = { accountId, peerId: `demo-peer-${ci + 1}`, title: c.title, mode: c.mode, needsHuman: c.needsHuman, draft, lastMessageAt: last, deletedAt: null };
    await db.chat.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
    for (const [mi, [direction, author, text]] of c.msgs.entries()) {
      const id = `${c.id}-m${mi + 1}`;
      const m = { chatId: c.id, tgMsgId: mi + 1, direction, author, text, sentAt: new Date(last.getTime() - (c.msgs.length - 1 - mi) * 60_000), deletedAt: null };
      await db.inboxMessage.upsert({ where: { id }, create: { id, ...m }, update: m });
    }
  }

  const findings = [
    ['demo-finding-1', 'not_found', "Mijoz lag'mon so'radi — katalogda yo'q, agent nima qilishni bilmadi"],
    ['demo-finding-2', 'not_found', "Boshqa mijoz ham lag'mon va manti so'radi — katalogda yo'q"],
    ['demo-finding-3', 'unanswered', "Mijoz uyga yetkazib berish bormi deb so'radi — agent aniq javob bermadi, xodimga ham ulamadi"],
  ] as const;
  for (const [id, type, detail] of findings) {
    const f = { sessionId: 'demo-session', businessId: 'biz-osh', type, detail, at: new Date(base), deletedAt: null };
    await db.auditFinding.upsert({ where: { id }, create: { id, ...f }, update: f });
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`seed failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
