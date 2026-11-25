// Owners-only access: @Auth() (401 without a valid token, before any lookup) + the user's phone in ADMIN_PHONES.
// Empty / unset ADMIN_PHONES = nobody is admin (403). Fail closed.
import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { normalizePhone } from '../auth/auth.util';

/** ADMIN_PHONES="+998901234567, 90 765 43 21" → normalized +998XXXXXXXXX list; invalid entries are dropped. */
export const adminPhones = (): string[] =>
  (process.env.ADMIN_PHONES ?? '').split(',').map((p) => normalizePhone(p.trim())).filter((p): p is string => p !== null);

/**
 * Only a stored phone already in canonical +998XXXXXXXXX form can be admin. Telegram users store `tg:<telegramId>`, and
 * normalizePhone would turn a 9-digit telegram id into a valid phone, so a tg: (or null / non-canonical) phone is never admin.
 */
export const isAdmin = (user: Pick<DbUser, 'phone'>): boolean => {
  const stored: string | null = user.phone;
  if (!stored || stored.startsWith('tg:') || normalizePhone(stored) !== stored) return false;
  return adminPhones().includes(stored);
};

/** Runs after AuthGuard (which puts the DB user on req.user). */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<Request & { user?: DbUser }>().user;
    if (!user) throw new UnauthorizedException('Avtorizatsiya kerak');
    if (!isAdmin(user)) throw new ForbiddenException("Ruxsat yo'q");
    return true;
  }
}

/** Class or route decorator: login required, then ADMIN_PHONES check. */
export const Admin = () => applyDecorators(UseGuards(AuthGuard, AdminGuard));
