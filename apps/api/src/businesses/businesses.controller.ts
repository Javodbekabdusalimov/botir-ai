import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Business as DbBusiness, User as DbUser } from '@prisma/client';
import type { CatalogImportResult, CatalogItemDto, CreateBusinessDto, MemoryFact } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ownsBusiness } from '../auth/ownership';
import { ok } from '../common/http';
import { toBusiness, toCatalogItem, toOrder } from '../db/mappers';
import { PrismaService } from '../db/prisma.service';
import { MetricsService } from '../knowledge/metrics.service';
import { AnalyticsService } from './analytics.service';
import { normalizeRows, readSheet } from './catalog-import';

type CatalogPatch = Partial<CatalogItemDto> & { id?: string };

const validPrice = (v: unknown): boolean => Number.isFinite(Number(v)) && Number(v) >= 0;

@Controller('businesses')
export class BusinessesController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  @Get()
  async list() {
    const rows = await this.db.business.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return ok(rows.map(toBusiness));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(toBusiness(await this.business(id)));
  }

  /** Login required; the creator becomes the owner (a business user without a business gets linked to it). */
  @Post()
  @Auth()
  async create(@Body() dto: CreateBusinessDto, @CurrentUser() user: DbUser) {
    if (!dto?.name || !dto.category) throw new BadRequestException('name and category are required');
    const row = await this.db.business.create({
      data: {
        ...this.businessData(dto), name: dto.name, category: dto.category, workHours: dto.workHours ? JSON.stringify(dto.workHours) : '',
        ownerUserId: user.id,
      },
    });
    if (user.role === 'business' && !user.businessId) await this.db.user.update({ where: { id: user.id }, data: { businessId: row.id } });
    return ok(toBusiness(row));
  }

  @Patch(':id')
  @Auth()
  async update(@Param('id') id: string, @Body() dto: Partial<CreateBusinessDto>, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    return ok(toBusiness(await this.db.business.update({ where: { id }, data: this.businessData(dto) })));
  }

  @Delete(':id')
  @Auth()
  async remove(@Param('id') id: string, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    await this.db.business.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ id });
  }

  @Get(':id/catalog')
  async catalog(@Param('id') id: string) {
    const rows = await this.db.catalogItem.findMany({ where: { businessId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return ok(rows.map(toCatalogItem));
  }

  @Post(':id/catalog')
  @Auth()
  async addItem(@Param('id') id: string, @Body() dto: CatalogItemDto, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    if (!dto?.name || !validPrice(dto.price)) throw new BadRequestException('name and price (>= 0) are required');
    const row = await this.db.catalogItem.create({ data: { businessId: id, ...this.itemData(dto), name: dto.name, price: Math.round(Number(dto.price)) } });
    await this.metrics.touchReady(id);
    return ok(toCatalogItem(row));
  }

  /** PATCH /businesses/:id/catalog {id, ...fields} (contract) or PATCH /businesses/:id/catalog/:itemId. */
  @Patch(':id/catalog')
  @Auth()
  async patchItemBody(@Param('id') id: string, @Body() dto: CatalogPatch, @CurrentUser() user: DbUser) {
    if (!dto?.id) throw new BadRequestException('id is required');
    return this.patchItem(id, dto.id, dto, user);
  }

  @Patch(':id/catalog/:itemId')
  @Auth()
  async patchItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: CatalogPatch, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    if (dto?.price !== undefined && !validPrice(dto.price)) throw new BadRequestException('price must be a number >= 0');
    const item = await this.db.catalogItem.findFirst({ where: { id: itemId, businessId: id, deletedAt: null } });
    if (!item) throw new NotFoundException('catalog item not found');
    const row = await this.db.catalogItem.update({ where: { id: itemId }, data: this.itemData(dto) });
    return ok(toCatalogItem(row));
  }

  @Delete(':id/catalog/:itemId')
  @Auth()
  async removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    await this.db.catalogItem.updateMany({ where: { id: itemId, businessId: id }, data: { deletedAt: new Date() } });
    return ok({ id: itemId });
  }

  /** multipart `file` (CSV/XLSX) or JSON `{ rows: [{name, price, unit}] }`. */
  @Post(':id/catalog/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Auth()
  async import(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { rows?: Record<string, unknown>[] },
    @CurrentUser() user: DbUser,
  ) {
    this.assertOwner(await this.business(id), user);
    const raw = file ? readSheet(file.buffer) : Array.isArray(body?.rows) ? body.rows : null;
    if (!raw) throw new BadRequestException('send multipart "file" (csv/xlsx) or JSON {rows}');
    const { rows, result } = normalizeRows(raw);
    for (const r of rows) {
      await this.db.catalogItem.create({ data: { businessId: id, name: r.name, price: r.price, unit: r.unit, description: r.description, tags: JSON.stringify(r.tags) } });
    }
    await this.metrics.touchReady(id);
    return ok<CatalogImportResult>({ ...result, imported: rows.length });
  }

  @Get(':id/orders')
  @Auth()
  async orders(@Param('id') id: string, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    const rows = await this.db.order.findMany({ where: { businessId: id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return ok(rows.map(toOrder));
  }

  @Get(':id/analytics')
  @Auth()
  async analyticsOf(@Param('id') id: string, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    return ok(await this.analytics.forBusiness(id));
  }

  /** Customer memory facts learned in this business's negotiations. */
  @Get(':id/memory')
  @Auth()
  async memory(@Param('id') id: string, @CurrentUser() user: DbUser) {
    this.assertOwner(await this.business(id), user);
    const rows = await this.db.memoryFact.findMany({ where: { businessId: id, deletedAt: null }, orderBy: { at: 'desc' }, take: 100 });
    return ok<MemoryFact[]>(
      rows.map((r) => ({
        id: r.id, subjectType: 'customer', subjectId: r.userId, fact: r.fact, source: r.sessionId ?? 'negotiation',
        confidence: r.weight, createdAt: r.at.toISOString(),
      })),
    );
  }

  private async business(id: string) {
    const b = await this.db.business.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw new NotFoundException('business not found');
    return b;
  }

  private assertOwner(b: DbBusiness, user: DbUser): void {
    if (!ownsBusiness(b, user)) throw new ForbiddenException('Bu biznesni o‘zgartirishga ruxsat yo‘q');
  }

  private businessData(dto: Partial<CreateBusinessDto>) {
    return {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.district !== undefined && { district: dto.district }),
      ...(dto.workHours !== undefined && { workHours: JSON.stringify(dto.workHours) }),
      ...(dto.maxDiscountPct !== undefined && { maxDiscountPct: Math.max(0, Math.min(50, Math.round(Number(dto.maxDiscountPct)))) }),
      ...(dto.lang !== undefined && { lang: dto.lang }),
      ...(dto.geo !== undefined && { geoLat: dto.geo.lat, geoLng: dto.geo.lng }),
    };
  }

  private itemData(dto: CatalogPatch) {
    return {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: Math.round(Number(dto.price)) }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
      ...(dto.inStock !== undefined && { inStock: dto.inStock }),
      ...(dto.tags !== undefined && { tags: JSON.stringify(dto.tags) }),
    };
  }
}
