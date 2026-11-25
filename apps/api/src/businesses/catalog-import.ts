import * as XLSX from 'xlsx';
import type { CatalogImportResult } from '@botir/shared';
import { parseSom } from '../knowledge/text-utils';

export interface CatalogRow {
  name: string;
  price: number;
  unit: string;
  description?: string;
  tags: string[];
}

/** One import = at most this many rows (a tiny XLSX can unpack to a million rows and eat the server's memory). */
export const MAX_IMPORT_ROWS = 2000;
const MAX_ERRORS = 50;

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const [k, v] of Object.entries(row)) if (keys.includes(k.trim().toLowerCase())) return v;
  return undefined;
};

/** CSV / XLSX buffer → raw rows (first sheet, header row). */
export function readSheet(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer', sheetRows: MAX_IMPORT_ROWS + 2 }); // header + 1 extra row to detect "too many"
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  return sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
}

/** Accepts uz/ru/en headers: name|nomi|название, price|narx|цена, unit|birlik|ед. */
export function normalizeRows(raw: Record<string, unknown>[]): { rows: CatalogRow[]; result: CatalogImportResult } {
  const rows: CatalogRow[] = [];
  const result: CatalogImportResult = { imported: 0, skipped: 0, errors: [] };
  raw.forEach((r, i) => {
    const name = String(pick(r, ['name', 'nomi', 'nom', 'название', 'наименование', 'mahsulot', 'товар']) ?? '').trim();
    // "45 000" | "45.000" | "45 ming" → 45000; ranges ("30-40"), negatives and > 2 mlrd → error (never a wrong price).
    const priceRaw = pick(r, ['price', 'narx', 'narxi', 'цена', 'стоимость']);
    const price = parseSom(typeof priceRaw === 'number' ? Math.round(priceRaw) : priceRaw);
    if (!name || price === null) {
      result.skipped += 1;
      if (result.errors.length < MAX_ERRORS) result.errors.push(`${i + 2}-qator: nomi yoki narxi noto'g'ri`);
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
