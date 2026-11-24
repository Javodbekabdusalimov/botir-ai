import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CatalogItem } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogItemDto, UpdateCatalogItemDto } from './dto';

export interface CatalogImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Accepted header spellings, so an owner can upload the file as they keep it. */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  name: ['name', 'nomi', 'mahsulot', 'tovar', 'наименование', 'название'],
  price: ['price', 'narx', 'narxi', 'цена', 'summa'],
  unit: ['unit', 'birlik', 'olchov', 'единица', 'ед'],
  description: ['description', 'tavsif', 'izoh', 'описание'],
  durationMin: ['durationmin', 'davomiyligi', 'vaqt', 'длительность'],
  tags: ['tags', 'teglar', 'kategoriya', 'теги', 'категория'],
};

const MAX_IMPORT_ROWS = 2000;
const HEADER_OFFSET = 2;

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string): Promise<CatalogItem[]> {
    return this.prisma.catalogItem.findMany({
      where: { businessId, isDeleted: false },
      orderBy: { name: 'asc' },
    });
  }

  create(businessId: string, dto: CatalogItemDto): Promise<CatalogItem> {
    return this.prisma.catalogItem.create({
      data: {
        businessId,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        unit: dto.unit,
        durationMin: dto.durationMin ?? null,
        inStock: dto.inStock ?? true,
        tags: dto.tags ?? [],
      },
    });
  }

  async update(businessId: string, dto: UpdateCatalogItemDto): Promise<CatalogItem> {
    const existing = await this.prisma.catalogItem.findFirst({
      where: { id: dto.id, businessId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('catalog item not found');

    return this.prisma.catalogItem.update({
      where: { id: dto.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.inStock !== undefined ? { inStock: dto.inStock } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
  }

  /** Excel or CSV upload. Unreadable rows are reported, never guessed. */
  async importFile(businessId: string, buffer: Buffer): Promise<CatalogImportResult> {
    const result: CatalogImportResult = { imported: 0, skipped: 0, errors: [] };

    let rows: Record<string, unknown>[];
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) return { ...result, errors: ['file has no sheets'] };
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]);
    } catch (error) {
      this.logger.warn(`catalog import could not parse the file: ${(error as Error).message}`);
      return { ...result, errors: ['file could not be parsed as Excel or CSV'] };
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return { ...result, errors: [`too many rows: ${rows.length} (max ${MAX_IMPORT_ROWS})`] };
    }

    const payload: CatalogItemDto[] = [];
    rows.forEach((row, index) => {
      const name = this.pick(row, 'name');
      const priceRaw = this.pick(row, 'price');
      const price = Number(String(priceRaw ?? '').replace(/[^\d.-]/g, ''));

      if (!name || !Number.isFinite(price) || price < 0) {
        result.skipped += 1;
        result.errors.push(`row ${index + HEADER_OFFSET}: name or price missing or invalid`);
        return;
      }

      const description = this.pick(row, 'description');
      const unit = this.pick(row, 'unit');
      const duration = Number(this.pick(row, 'durationMin'));
      const tagsRaw = this.pick(row, 'tags');

      payload.push({
        name: String(name).slice(0, 200),
        description: description ? String(description).slice(0, 1000) : undefined,
        price: Math.round(price),
        unit: unit ? String(unit).slice(0, 40) : 'dona',
        durationMin: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        tags: tagsRaw
          ? String(tagsRaw)
              .split(/[,;]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      });
    });

    if (payload.length > 0) {
      const created = await this.prisma.catalogItem.createMany({
        data: payload.map((item) => ({
          businessId,
          name: item.name,
          description: item.description ?? null,
          price: item.price,
          unit: item.unit,
          durationMin: item.durationMin ?? null,
          tags: item.tags ?? [],
        })),
      });
      result.imported = created.count;
    }

    return result;
  }

  private pick(row: Record<string, unknown>, field: keyof typeof COLUMN_ALIASES): unknown {
    const aliases = COLUMN_ALIASES[field];
    for (const key of Object.keys(row)) {
      if (aliases.includes(key.trim().toLowerCase())) return row[key];
    }
    return undefined;
  }
}
