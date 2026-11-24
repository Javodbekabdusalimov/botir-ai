import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { normalizeName } from './text-utils';

export interface CatalogUpsert {
  name: string;
  price: number;
  unit?: string;
  inStock?: boolean;
  /** Known target (fact already linked to an item): update it even if the name changed. */
  itemId?: string | null;
}

/** Upsert by normalized name. Serialized per business, so two parallel confirms/syncs cannot create the same item twice. */
@Injectable()
export class CatalogWriter {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  upsert(businessId: string, rows: CatalogUpsert[]): Promise<{ ids: string[]; created: number; updated: number }> {
    const next = (this.queues.get(businessId) ?? Promise.resolve()).then(() => this.write(businessId, rows));
    const settled = next.catch(() => undefined);
    this.queues.set(businessId, settled);
    void settled.then(() => {
      if (this.queues.get(businessId) === settled) this.queues.delete(businessId);
    });
    return next;
  }

  private async write(businessId: string, rows: CatalogUpsert[]) {
    const items = await this.db.catalogItem.findMany({ where: { businessId, deletedAt: null }, select: { id: true, name: true } });
    const byName = new Map(items.map((i) => [normalizeName(i.name), i.id]));
    const live = new Set(items.map((i) => i.id));
    const result = { ids: [] as string[], created: 0, updated: 0 };
    await this.db.$transaction(
      async (tx) => {
        for (const r of rows) {
          const data = { price: r.price, ...(r.unit && { unit: r.unit }), ...(r.inStock !== undefined && { inStock: r.inStock }) };
          const key = normalizeName(r.name);
          const linked = r.itemId && live.has(r.itemId) ? r.itemId : undefined;
          const id = linked ?? byName.get(key);
          if (id) {
            await tx.catalogItem.update({ where: { id }, data: linked ? { ...data, name: r.name } : data });
            result.updated += 1;
            result.ids.push(id);
            continue;
          }
          const row = await tx.catalogItem.create({ data: { businessId, name: r.name, ...data } });
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
