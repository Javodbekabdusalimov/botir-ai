import Papa from "papaparse";

import type { CatalogRowInput } from "./types";

export type CatalogRow = CatalogRowInput;

type Cell = unknown;
const NAME_WORDS = ["nomi", "nom", "name", "mahsulot", "tovar", "xizmat", "taom", "product", "item", "title", "service", "название", "наименование", "товар", "услуга", "продукт", "блюдо"];
const PRICE_WORDS = ["narx", "price", "cost", "baho", "summa", "so'm", "som", "uzs", "цена", "стоимость", "сумма", "сум"];
const UNIT_WORDS = ["birlik", "unit", "o'lchov", "olchov", "ед", "единица", "измер"];

export interface ParsedCatalog {
  rows: CatalogRow[];
  /** Noto'g'ri qatorlar raqami (faylda, 1 dan) */
  skipped: number[];
}

const norm = (c: Cell) => String(c ?? "").trim().toLowerCase().replace(/[ʻʼ‘’`]/g, "'");
const has = (c: Cell, words: string[]) => {
  const s = norm(c);
  return !!s && words.some((w) => s.includes(w));
};

/** 45000, "45 000 so'm", "45.000", "45,000", "от 50 000" → so'm. Narx emas → null. */
export function cellPrice(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) && c > 0 ? Math.round(c) : null;
  const m = String(c ?? "").replace(/ /g, " ").match(/\d{1,3}(?:[ .,']\d{3})+(?![\d])|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const t = m[0];
  const n = /^\d{1,3}(?:[ .,']\d{3})+$/.test(t) ? Number(t.replace(/[ .,']/g, "")) : Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const TOTAL = /^(jami|umumiy|итого|всего|total)\b/i;
const isText = (c: Cell) => typeof c === "string" && /\p{L}/u.test(c) && cellPrice(c) === null;

/** Sarlavha qatori (birinchi 15 qatordan): nom va narx so'zi bor qator. */
function findHeader(grid: Cell[][]): { at: number; name: number; price: number; unit: number } | null {
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const row = grid[i];
    const price = row.findIndex((c) => has(c, PRICE_WORDS));
    if (price < 0) continue;
    let name = row.findIndex((c, j) => j !== price && has(c, NAME_WORDS));
    if (name < 0) name = row.findIndex((c, j) => j !== price && isText(c));
    if (name < 0) continue;
    return { at: i, name, price, unit: row.findIndex((c, j) => j !== name && j !== price && has(c, UNIT_WORDS)) };
  }
  return null;
}

/** Sarlavhasiz fayl: narx ustuni = eng ko'p raqamli, nom ustuni = eng ko'p matnli. */
function guessColumns(grid: Cell[][]): { name: number; price: number } | null {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const score = (j: number, f: (c: Cell) => boolean) => grid.filter((r) => f(r[j])).length;
  let price = -1, name = -1, bestP = 0, bestN = 0;
  for (let j = 0; j < width; j++) {
    const p = score(j, (c) => (cellPrice(c) ?? 0) >= 100);
    if (p > bestP) [bestP, price] = [p, j];
  }
  for (let j = 0; j < width; j++) {
    if (j === price) continue;
    const t = score(j, isText);
    if (t > bestN) [bestN, name] = [t, j];
  }
  return price >= 0 && name >= 0 ? { name, price } : null;
}

export function parseGrid(grid: Cell[][]): ParsedCatalog {
  const rows = grid.filter((r) => r.some((c) => norm(c) !== ""));
  const header = findHeader(rows);
  const cols = header ?? guessColumns(rows);
  if (!cols) return { rows: [], skipped: [] };
  const start = header ? header.at + 1 : 0;
  const unitCol = header?.unit ?? -1;
  const out: CatalogRow[] = [];
  const skipped: number[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[cols.name] ?? "").trim();
    const price = cellPrice(r[cols.price]);
    if (!name || price === null || !/\p{L}/u.test(name) || TOTAL.test(name)) {
      skipped.push(i + 1);
      continue;
    }
    out.push({ name, price, unit: (unitCol >= 0 ? String(r[unitCol] ?? "").trim() : "") || "dona" });
  }
  return { rows: out, skipped };
}

/** CSV (papaparse) va Excel (xlsx, faqat kerak bo'lganda yuklanadi) fayllarini brauzerda o'qiydi. */
export async function parseCatalogFile(file: File): Promise<ParsedCatalog> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    // Birinchi bo'sh bo'lmagan varaq
    for (const n of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, defval: "" });
      const res = parseGrid(grid);
      if (res.rows.length) return res;
    }
    return { rows: [], skipped: [] };
  }
  if (ext === "csv" || ext === "txt") {
    const res = Papa.parse<Cell[]>(await file.text(), { header: false, skipEmptyLines: true });
    return parseGrid(res.data);
  }
  throw new Error("Faqat .xlsx, .xls yoki .csv fayl yuklang");
}

export const SAMPLE_CSV = "nomi,narx,birlik\nTo'y oshi,45000,porsiya\nTandir non,4000,dona\nKo'k choy,15000,choynak\n";

/** Qo'lda yozilgan ro'yxat: har qatorda "Moy almashtirish 150 000" yoki "Razval | 120.000 | dona". */
export function parseCatalogText(text: string): ParsedCatalog {
  const grid = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|\||;/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
      const m = line.match(/^(.*?)[\s:–-]+(\d{1,3}(?:[ .,']\d{3})+|\d+)\s*(?:so'?m|sum|сум|uzs)?\.?\s*$/i);
      return m ? [m[1], m[2]] : [line];
    });
  return parseGrid([["nomi", "narx", "birlik"], ...grid]);
}
