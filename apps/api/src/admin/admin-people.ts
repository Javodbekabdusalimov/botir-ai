// Name / phone lookups shared by the admin lists. Soft-deleted users and businesses are never returned.
import type { PrismaService } from '../db/prisma.service';

export const DAY_MS = 86_400_000;
/** Real money (invariant 3): paid && not a TEST payment, not soft-deleted. */
export const REAL_PAID = { status: 'paid', isTest: false, deletedAt: null } as const;

export interface Person {
  name: string;
  phone: string | null;
}

/** Users by id (not deleted). */
export async function usersById(db: PrismaService, ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: [...new Set(ids)] }, deletedAt: null }, select: { id: true, name: true, phone: true } });
  return new Map(rows.map((u) => [u.id, { name: u.name, phone: u.phone }]));
}

/** Businesses by id (not deleted): business name + the owner's phone (business account linked to it, else its creator). */
export async function businessesById(db: PrismaService, ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const list = await db.business.findMany({ where: { id: { in: [...new Set(ids)] }, deletedAt: null }, select: { id: true, name: true, ownerUserId: true } });
  const owners = await db.user.findMany({
    where: { deletedAt: null, OR: [{ businessId: { in: list.map((b) => b.id) } }, { id: { in: list.map((b) => b.ownerUserId) } }] },
    select: { id: true, phone: true, businessId: true },
  });
  const phoneOf = (b: { id: string; ownerUserId: string }): string | null =>
    owners.find((u) => u.businessId === b.id)?.phone ?? owners.find((u) => u.id === b.ownerUserId)?.phone ?? null;
  return new Map(list.map((b) => [b.id, { name: b.name, phone: phoneOf(b) }]));
}

/** Case-insensitive match on name / phone; a query with 3+ digits also matches the phone's digits ("90 111" → +99890111…). */
export function matches(q: string, ...fields: (string | null)[]): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const digits = query.replace(/\D/g, '');
  return fields.some((f) => {
    if (!f) return false;
    if (f.toLowerCase().includes(query)) return true;
    return digits.length >= 3 && f.replace(/\D/g, '').includes(digits);
  });
}

/** limit 1..200 (default 50), offset ≥ 0. */
export function page(limit?: string, offset?: string): { limit: number; offset: number } {
  const l = Number(limit);
  const o = Number(offset);
  return { limit: Number.isInteger(l) && l > 0 ? Math.min(l, 200) : 50, offset: Number.isInteger(o) && o > 0 ? o : 0 };
}
