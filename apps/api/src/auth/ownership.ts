import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Business as DbBusiness, User as DbUser } from '@prisma/client';
import type { PrismaService } from '../db/prisma.service';

/** True if `user` owns business `b` (creator or the business account linked to it). */
export const ownsBusiness = (b: Pick<DbBusiness, 'id' | 'ownerUserId'>, user: DbUser): boolean =>
  b.ownerUserId === user.id || user.businessId === b.id;

/** 404 if the business does not exist, 403 if `user` is not its owner. Use after `@Auth()`. */
export async function assertBusinessOwner(db: PrismaService, businessId: string, user: DbUser): Promise<DbBusiness> {
  const b = await db.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!b) throw new NotFoundException('business not found');
  if (!ownsBusiness(b, user)) throw new ForbiddenException('Bu biznesga ruxsat yo‘q');
  return b;
}
