// Rules for POST /negotiations/:id/confirm (no Nest state): who may confirm what, and how a lost race is reported.
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NegotiationTask, Order } from '@botir/shared';
import { errMsg } from '../common/http';
import { OFFER_TTL_MS } from './event-mapper';

export interface ConfirmOptions {
  acceptUpsell?: boolean;
  /** Bearer user id, null = no valid token. Omitted by internal callers (Telegram bot) = guest rules. */
  viewerId?: string | null;
  /** best_offer.taskId: confirm this task's offer of the business (one business can serve two tasks). */
  taskId?: string;
}

/** 409 with the order that already exists: the controller adds orderId + paymentLink to the body (ConfirmConflict). */
export class OrderExistsError extends ConflictException {
  constructor(
    readonly orderId: string,
    readonly paymentLink?: string,
  ) {
    super(`Bu taklif allaqachon tasdiqlangan. Buyurtma: ${orderId}`);
  }
}

/** Thrown inside the transaction when the conditional update lost to a parallel confirm. */
export class ConfirmRace extends Error {}

const STATUS_TEXT: Record<string, string> = {
  running: 'Muzokara hali tugamadi, biroz kuting.',
  rejected: "Agentlar kelisha olmadi, bu muzokarani tasdiqlab bo'lmaydi.",
  failed: "Muzokara texnik xato bilan tugadi, tasdiqlab bo'lmaydi. So'rovni qaytadan yuboring.",
};

/** Only an agreed negotiation, or one where another task is already confirmed, can take a new order. */
export function assertConfirmable(status: string): void {
  if (status === 'agreed' || status === 'confirmed') return;
  throw new ConflictException(STATUS_TEXT[status] ?? "Bu muzokarani tasdiqlab bo'lmaydi.");
}

/** The offer card promises "Amal qiladi: …gacha" = createdAt + 30 min; the server keeps that promise, not more. */
export const isExpired = (createdAt: Date, now = Date.now()): boolean => now > createdAt.getTime() + OFFER_TTL_MS;

/** A parallel confirm lost: unique offerId, write conflict, SQLite busy, pool / transaction-start timeout. 409, never 500. */
export function isRaceError(e: unknown): boolean {
  if (e instanceof ConfirmRace) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) return ['P2002', 'P2034', 'P2024', 'P2028'].includes(e.code);
  return /database is locked|SQLITE_BUSY/i.test(errMsg(e));
}

/** Order.details JSON from the negotiated task: when / people / wishes (only the fields the client gave). */
export function orderDetails(task: NegotiationTask | undefined): string | null {
  if (!task) return null;
  const details: NonNullable<Order['details']> = {
    ...(task.when ? { when: task.when } : {}),
    ...(task.people ? { people: task.people } : {}),
    ...(task.wishes ? { wishes: task.wishes } : {}),
  };
  return Object.keys(details).length ? JSON.stringify(details) : null;
}
