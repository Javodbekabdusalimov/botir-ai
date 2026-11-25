import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SyncCatalogResult } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { CatalogWriter, type CatalogUpsert } from './catalog-writer.service';
import { LIMITS } from './fact-validation';
import { MetricsService } from './metrics.service';
import { cleanLine, normalizeName, parseSom } from './text-utils';

const MAX_ITEMS = 500;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Generic catalog push API for any POS/script. Not a vendor integration: iiko/1C were not tested. */
@Injectable()
export class SyncService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CatalogWriter) private readonly catalog: CatalogWriter,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  /** New key replaces the old one; only its hash is stored, so this is the only time it is visible. */
  async createKey(businessId: string): Promise<string> {
    const key = `bsk_${randomBytes(32).toString('hex')}`;
    await this.db.business.update({ where: { id: businessId }, data: { syncKeyHash: sha256(key) } });
    return key;
  }

  async businessByKey(key: unknown): Promise<string> {
    const given = typeof key === 'string' && /^bsk_[0-9a-f]{64}$/.test(key) ? sha256(key) : '';
    const b = given ? await this.db.business.findFirst({ where: { syncKeyHash: given, deletedAt: null } }) : null;
    if (!b?.syncKeyHash || !timingSafeEqual(Buffer.from(b.syncKeyHash), Buffer.from(given))) throw new UnauthorizedException('X-Sync-Key yaroqsiz');
    return b.id;
  }

  async push(businessId: string, rawItems: unknown): Promise<SyncCatalogResult> {
    if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > MAX_ITEMS) {
      throw new BadRequestException(`items: 1 dan ${MAX_ITEMS} tagacha mahsulot yuboring`);
    }
    const errors: string[] = [];
    const rows = new Map<string, CatalogUpsert>(); // last row wins when a name repeats
    rawItems.forEach((raw: unknown, i) => {
      const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const name = cleanLine(r.name, LIMITS.topic);
      const key = normalizeName(name);
      if (!key) return errors.push(`${i + 1}: name noto'g'ri`);
      const price = parseSom(r.price); // 45000 or a POS string like "45 000" / "45.000"
      if (price === null) return errors.push(`${i + 1}: price 0 yoki undan katta butun son bo'lsin`);
      if (r.unit !== undefined && typeof r.unit !== 'string') return errors.push(`${i + 1}: unit matn bo'lsin`);
      if (r.inStock !== undefined && typeof r.inStock !== 'boolean') return errors.push(`${i + 1}: inStock true/false bo'lsin`);
      return rows.set(key, { name, price, unit: cleanLine(r.unit, LIMITS.unit) || undefined, inStock: r.inStock });
    });
    if (!rows.size) return { updated: 0, created: 0, errors };
    const { created, updated } = await this.catalog.upsert(businessId, [...rows.values()]);
    await this.markSynced(businessId);
    await this.metrics.touchReady(businessId);
    return { updated, created, errors };
  }

  /** One "sync" source per business (not one per push), so the owner sees that a POS is connected. */
  private async markSynced(businessId: string): Promise<void> {
    const { count } = await this.db.knowledgeSource.updateMany({
      where: { businessId, kind: 'sync', deletedAt: null }, data: { status: 'ready', updatedAt: new Date() },
    });
    if (!count) await this.db.knowledgeSource.create({ data: { businessId, kind: 'sync', label: 'Katalog sinxronizatsiyasi', status: 'ready' } });
  }
}
