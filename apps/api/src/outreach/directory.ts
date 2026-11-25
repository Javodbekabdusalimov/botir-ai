import { normalizeContacts, type ExternalContacts } from './contacts';

const CATEGORIES = ['restaurant', 'shop', 'autoservice', 'clinic', 'beauty', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export interface DirectoryRow {
  dedupeKey: string;
  name: string;
  category: Category;
  district: string | null;
  address: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  workHours: string | null;
  contacts: ExternalContacts;
  sources: string[];
  retrievedAt: string;
}

export type ParsedEntry = { ok: true; row: DirectoryRow } | { ok: false; reason: string };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null);
const coord = (v: unknown, lim: number): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);
const isHttp = (s: string): boolean => /^https?:\/\/\S+$/i.test(s);
const fold = (s: string | null): string => (s ?? '').toLowerCase().replace(/[ʻʼ'‘’`]/g, '').replace(/\s+/g, ' ');

/** name+address, case/apostrophe-insensitive: the idempotency key. */
export const dedupeKeyOf = (name: string, address: string | null): string => `${fold(name)}|${fold(address)}`;

/** One JSON entry → a clean row, or the reason it is rejected. Unknown optional values stay null (never invented). */
export function parseDirectoryEntry(raw: unknown): ParsedEntry {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const r = raw as Record<string, unknown>;
  const name = text(r.name);
  if (!name) return { ok: false, reason: 'name is required' };
  const category = CATEGORIES.find((c) => c === r.category);
  if (!category) return { ok: false, reason: `${name}: unknown category` };
  const sources = Array.isArray(r.sources) ? [...new Set(r.sources.filter((s): s is string => typeof s === 'string' && isHttp(s.trim())).map((s) => s.trim()))] : [];
  if (sources.length === 0) return { ok: false, reason: `${name}: no sources (every entry needs at least one URL)` };
  const address = text(r.address);
  const lat = coord(r.lat, 90);
  const lng = coord(r.lng, 180);
  const retrieved = text(r.retrievedAt);
  return {
    ok: true,
    row: {
      dedupeKey: dedupeKeyOf(name, address),
      name, category, address,
      district: text(r.district),
      landmark: text(r.landmark),
      // A single coordinate is useless: both or none.
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      workHours: text(r.workHours),
      contacts: normalizeContacts(r.contacts),
      sources,
      retrievedAt: retrieved && !Number.isNaN(Date.parse(retrieved)) ? retrieved : new Date().toISOString().slice(0, 10),
    },
  };
}

/** Persistence seam (Prisma in prod, a Map in tests). */
export interface DirectoryStore {
  /** true when a row with this key exists, even a soft-deleted one: create-only never resurrects or overwrites. */
  has(dedupeKey: string): Promise<boolean>;
  create(row: DirectoryRow): Promise<void>;
}

export interface ImportReport {
  created: number;
  skipped: number;
  rejected: string[];
}

export async function importDirectory(store: DirectoryStore, entries: unknown): Promise<ImportReport> {
  if (!Array.isArray(entries)) throw new Error('directory file must be a JSON array');
  const report: ImportReport = { created: 0, skipped: 0, rejected: [] };
  for (const raw of entries) {
    const parsed = parseDirectoryEntry(raw);
    if (!parsed.ok) {
      report.rejected.push(parsed.reason);
    } else if (await store.has(parsed.row.dedupeKey)) {
      report.skipped++;
    } else {
      await store.create(parsed.row);
      report.created++;
    }
  }
  return report;
}
