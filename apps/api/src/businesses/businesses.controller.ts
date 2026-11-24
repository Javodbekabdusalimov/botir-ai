import {
  BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { CatalogImportResult, CatalogItemDto, CreateBusinessDto, MemoryFact } from '@botir/shared';
import { ok } from '../common/http';
import { toBusiness, toCatalogItem, toOrder } from '../db/mappers';
import { PrismaService } from '../db/prisma.service';
import { AnalyticsService } from './analytics.service';
import { normalizeRows, readSheet } from './catalog-import';

type CatalogPatch = Partial<CatalogItemDto> & { id?: string };

@Controller('businesses')
export class BusinessesController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
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

  @Post()
  async create(@Body() dto: CreateBusinessDto) {
    if (!dto?.name || !dto.category) throw new BadRequestException('name and category are required');
    const row = await this.db.business.create({
      data: { ...this.businessData(dto), name: dto.name, category: dto.category, workHours: dto.workHours ? JSON.stringify(dto.workHours) : '' },
    });
    return ok(toBusiness(row));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateBusinessDto>) {
    await this.business(id);
    return ok(toBusiness(await this.db.business.update({ where: { id }, data: this.businessData(dto) })));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.business(id);
    await this.db.business.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ id });
  }

  @Get(':id/catalog')
  async catalog(@Param('id') id: string) {
    const rows = await this.db.catalogItem.findMany({ where: { businessId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return ok(rows.map(toCatalogItem));
  }

  @Post(':id/catalog')
  async addItem(@Param('id') id: string, @Body() dto: CatalogItemDto) {
    await this.business(id);
    if (!dto?.name || !Number.isFinite(Number(dto.price))) throw new BadRequestException('name and price are required');
    const row = await this.db.catalogItem.create({ data: { businessId: id, ...this.itemData(dto), name: dto.name, price: Math.round(Number(dto.price)) } });
    return ok(toCatalogItem(row));
  }

  /** PATCH /businesses/:id/catalog {id, ...fields} (contract) or PATCH /businesses/:id/catalog/:itemId. */
  @Patch(':id/catalog')
  async patchItemBody(@Param('id') id: string, @Body() dto: CatalogPatch) {
    if (!dto?.id) throw new BadRequestException('id is required');
    return this.patchItem(id, dto.id, dto);
  }

  @Patch(':id/catalog/:itemId')
  async patchItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: CatalogPatch) {
    const item = await this.db.catalogItem.findFirst({ where: { id: itemId, businessId: id, deletedAt: null } });
    if (!item) throw new NotFoundException('catalog item not found');
    const row = await this.db.catalogItem.update({ where: { id: itemId }, data: this.itemData(dto) });
    return ok(toCatalogItem(row));
  }

  @Delete(':id/catalog/:itemId')
  async removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    await this.db.catalogItem.updateMany({ where: { id: itemId, businessId: id }, data: { deletedAt: new Date() } });
    return ok({ id: itemId });
  }

  /** multipart `file` (CSV/XLSX) or JSON `{ rows: [{name, price, unit}] }`. */
  @Post(':id/catalog/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async import(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer } | undefined, @Body() body: { rows?: Record<string, unknown>[] }) {
    await this.business(id);
    const raw = file ? readSheet(file.buffer) : Array.isArray(body?.rows) ? body.rows : null;
    if (!raw) throw new BadRequestException('send multipart "file" (csv/xlsx) or JSON {rows}');
    const { rows, result } = normalizeRows(raw);
    for (const r of rows) {
      await this.db.catalogItem.create({ data: { businessId: id, name: r.name, price: r.price, unit: r.unit, description: r.description, tags: JSON.stringify(r.tags) } });
    }
    return ok<CatalogImportResult>({ ...result, imported: rows.length });
  }

  @Get(':id/orders')
  async orders(@Param('id') id: string) {
    const rows = await this.db.order.findMany({ where: { businessId: id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return ok(rows.map(toOrder));
  }

  @Get(':id/analytics')
  async analyticsOf(@Param('id') id: string) {
    await this.business(id);
    return ok(await this.analytics.forBusiness(id));
  }

  /** Customer memory facts learned in this business's negotiations. */
  @Get(':id/memory')
  async memory(@Param('id') id: string) {
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
