import Papa from "papaparse";

import type { CatalogRowInput } from "./types";

export type CatalogRow = CatalogRowInput;

const NAME_KEYS = ["name", "nomi", "nom", "mahsulot", "tovar", "название", "наименование"];
const PRICE_KEYS = ["price", "narx", "narxi", "цена", "summa"];
const UNIT_KEYS = ["unit", "birlik", "o'lchov", "olchov", "ед", "единица"];

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(row)) {
    const nk = k.trim().toLowerCase();
    if (keys.some((x) => nk === x || nk.startsWith(x))) return row[k];
  }
  return undefined;
}

function normalize(rows: Record<string, unknown>[]): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (const r of rows) {
    const name = String(pick(r, NAME_KEYS) ?? "").trim();
    const price = Number(String(pick(r, PRICE_KEYS) ?? "").replace(/[^\d.]/g, ""));
    if (!name || !Number.isFinite(price) || price <= 0) continue;
    out.push({ name, price, unit: String(pick(r, UNIT_KEYS) ?? "dona").trim() || "dona" });
  }
  return out;
}

/** CSV (papaparse) va Excel (xlsx, faqat kerak bo'lganda yuklanadi) fayllarini brauzerda o'qiydi. */
export async function parseCatalogFile(file: File): Promise<CatalogRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return normalize(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet));
  }
  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    return normalize(res.data);
  }
  throw new Error("Faqat .xlsx, .xls yoki .csv fayl yuklang");
}

export const SAMPLE_CSV = "nomi,narx,birlik\nTo'y oshi,45000,porsiya\nTandir non,4000,dona\nKo'k choy,15000,choynak\n";
