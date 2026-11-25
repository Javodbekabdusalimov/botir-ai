import type { Business as DbBusiness, CatalogItem as DbCatalogItem, Order as DbOrder } from '@prisma/client';
import type { Business, BusinessCategory, CatalogItem, Lang, Order, OrderItem, OrderStatus, PublicBusiness, WorkHours } from '@botir/shared';
import type { AgentBusiness, Product } from '../agents';
import { parseJson } from '../common/http';
import { effectivePlan } from '../payments/plans';

const DEFAULT_HOURS: WorkHours = {
  mon: ['09:00', '21:00'], tue: ['09:00', '21:00'], wed: ['09:00', '21:00'], thu: ['09:00', '21:00'],
  fri: ['09:00', '21:00'], sat: ['09:00', '21:00'], sun: null,
};

export const workHoursOf = (b: DbBusiness): WorkHours => parseJson<WorkHours>(b.workHours, DEFAULT_HOURS);

export function toBusiness(b: DbBusiness): Business {
  return {
    id: b.id,
    name: b.name,
    category: b.category as BusinessCategory,
    address: b.address,
    district: b.district,
    geo: b.geoLat != null && b.geoLng != null ? { lat: b.geoLat, lng: b.geoLng } : undefined,
    landmark: b.landmark ?? undefined,
    workHours: workHoursOf(b),
    maxDiscountPct: b.maxDiscountPct,
    lang: b.lang as Lang,
    ownerUserId: b.ownerUserId,
    isDemo: b.isDemo,
    plan: effectivePlan(b), // 'start' once planUntil has passed
    planUntil: b.planUntil?.toISOString() ?? null,
    aiCredits: b.aiCredits,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Public read: a client must not see the negotiation floor (maxDiscountPct), the owner's user id or the AI quota. */
export function toPublicBusiness(b: DbBusiness): PublicBusiness {
  const { maxDiscountPct: _floor, ownerUserId: _owner, aiCredits: _credits, ...rest } = toBusiness(b);
  return rest;
}

/** Agent layer needs a single open/close pair: take the first open day. */
export function toAgentBusiness(b: DbBusiness): AgentBusiness {
  // Broken hours (null, or a day that is not ["HH:MM","HH:MM"]) must not throw for the whole category:
  // they map to an empty pair, which the personal agent skips with a warning.
  const days: unknown = workHoursOf(b);
  const open = days && typeof days === 'object' ? Object.values(days).filter((d) => d !== null) : [null];
  const isPair = (d: unknown): d is [string, string] => Array.isArray(d) && d.length === 2 && d.every((t) => typeof t === 'string');
  const first = open.length === 0 ? ['09:00', '21:00'] : open.every(isPair) ? open[0] : ['', ''];
  return {
    id: b.id,
    name: b.name,
    category: b.category as BusinessCategory,
    area: b.district,
    maxDiscountPct: b.maxDiscountPct,
    hours: { open: first[0], close: first[1] },
    isDemo: b.isDemo,
    notes: b.notes ?? undefined,
  };
}

export function toCatalogItem(c: DbCatalogItem): CatalogItem {
  return {
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    description: c.description ?? undefined,
    price: c.price,
    unit: c.unit,
    durationMin: c.durationMin ?? undefined,
    inStock: c.inStock,
    tags: parseJson<string[]>(c.tags, []),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const toProduct = (c: DbCatalogItem): Product => ({
  id: c.id, businessId: c.businessId, name: c.name, price: c.price, unit: c.unit, description: c.description ?? undefined,
});

export function toOrder(o: DbOrder): Order {
  return {
    id: o.id,
    businessId: o.businessId,
    userId: o.userId,
    items: parseJson<OrderItem[]>(o.items, []),
    total: o.total,
    discountPct: o.discountPct,
    status: o.status as OrderStatus,
    details: parseJson<Order['details']>(o.details, undefined),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
