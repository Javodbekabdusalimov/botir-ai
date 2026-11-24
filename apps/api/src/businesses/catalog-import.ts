import * as XLSX from 'xlsx';
import type { CatalogImportResult } from '@botir/shared';

export interface CatalogRow {
  name: string;
  price: number;
  unit: string;
  description?: string;
  tags: string[];
}

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const [k, v] of Object.entries(row)) if (keys.includes(k.trim().toLowerCase())) return v;
  return undefined;
};

/** CSV / XLSX buffer → raw rows (first sheet, header row). */
export function readSheet(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  return sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
}

/** Accepts uz/ru/en headers: name|nomi|название, price|narx|цена, unit|birlik|ед. */
export function normalizeRows(raw: Record<string, unknown>[]): { rows: CatalogRow[]; result: CatalogImportResult } {
  const rows: CatalogRow[] = [];
  const result: CatalogImportResult = { imported: 0, skipped: 0, errors: [] };
  raw.forEach((r, i) => {
    const name = String(pick(r, ['name', 'nomi', 'nom', 'название', 'наименование', 'mahsulot', 'товар']) ?? '').trim();
    const priceRaw = String(pick(r, ['price', 'narx', 'narxi', 'цена', 'стоимость']) ?? '').replace(/[^\d.]/g, '');
    const price = Math.round(Number(priceRaw));
    if (!name || !priceRaw || !Number.isFinite(price) || price < 0) {
      result.skipped += 1;
      result.errors.push(`${i + 2}-qator: nomi yoki narxi noto'g'ri`);
      return;
    }
    const unit = String(pick(r, ['unit', 'birlik', 'ед', 'единица', 'ед.']) ?? '').trim() || 'dona';
    const description = String(pick(r, ['description', 'tavsif', 'описание']) ?? '').trim() || undefined;
    const tagsRaw = pick(r, ['tags', 'teglar', 'теги']);
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : String(tagsRaw ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    rows.push({ name, price, unit, description, tags });
  });
  return { rows, result };
}
