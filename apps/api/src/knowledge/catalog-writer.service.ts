import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { KeyedQueue } from './keyed-queue';
import { normalizeName, sameItemName } from './text-utils';

export interface CatalogUpsert {
  name: string;
  price: number;
  unit?: string;
  inStock?: boolean;
  /** Only fills an empty description: the owner's own text is never overwritten. */
  description?: string;
  /** Known target (fact already linked to an item): update it even if the name changed. */
  itemId?: string | null;
  /** Owner-confirmed fact: "Lavash (kichik) go'shtli" also matches "Lavash go'shti kichik". POS rows match exact names only. */
  similar?: boolean;
}

/** Upsert by normalized name. Serialized per business, so two parallel confirms/syncs cannot create the same item twice. */
@Injectable()
export class CatalogWriter {
  private readonly queue = new KeyedQueue();

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  upsert(businessId: string, rows: CatalogUpsert[]): Promise<{ ids: string[]; created: number; updated: number }> {
    return this.queue.run(businessId, () => this.write(businessId, rows));
  }

  private async write(businessId: string, rows: CatalogUpsert[]) {
    const items = await this.db.catalogItem.findMany({ where: { businessId, deletedAt: null }, select: { id: true, name: true, description: true } });
    const byName = new Map(items.map((i) => [normalizeName(i.name), i.id]));
    const live = new Set(items.map((i) => i.id));
    const described = new Set(items.filter((i) => i.description?.trim()).map((i) => i.id));
    const result = { ids: [] as string[], created: 0, updated: 0 };
    await this.db.$transaction(
      async (tx) => {
        for (const r of rows) {
          const data = { price: r.price, ...(r.unit && { unit: r.unit }), ...(r.inStock !== undefined && { inStock: r.inStock }) };
          const key = normalizeName(r.name);
          const linked = r.itemId && live.has(r.itemId) ? r.itemId : undefined;
          const id = linked ?? byName.get(key) ?? (r.similar ? similarItem(byName, r.name) : undefined);
          if (id) {
            const description = r.description && !described.has(id) ? { description: r.description } : {};
            await tx.catalogItem.update({ where: { id }, data: { ...data, ...description, ...(linked && { name: r.name }) } });
            result.updated += 1;
            result.ids.push(id);
            continue;
          }
          const row = await tx.catalogItem.create({ data: { businessId, name: r.name, ...data, ...(r.description && { description: r.description }) } });
          byName.set(key, row.id);
          live.add(row.id);
          result.created += 1;
          result.ids.push(row.id);
        }
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    return result;
  }
}

/** The only existing item with the same words; two candidates = ambiguous, so a new item is safer than a wrong price. */
function similarItem(byName: Map<string, string>, name: string): string | undefined {
  const ids = new Set([...byName].filter(([key]) => sameItemName(key, name)).map(([, id]) => id));
  return ids.size === 1 ? [...ids][0] : undefined;
}
