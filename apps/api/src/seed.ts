// Idempotent demo seed: the same 3 businesses + catalog as agents/store/seed.ts. Run: pnpm --filter api db:seed
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { WorkHours } from '@botir/shared';
import { DEMO_BUSINESSES, DEMO_PRODUCTS } from './agents';

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
  logger.log(`seeded ${DEMO_BUSINESSES.length} businesses, ${DEMO_PRODUCTS.length} catalog items`);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  process.stderr.write(`seed failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
