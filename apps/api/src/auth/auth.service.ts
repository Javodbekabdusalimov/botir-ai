import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { AuthUser, UserRole } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { signJwt, verifyJwt } from './auth.util';

export const toAuthUser = (u: DbUser): AuthUser => ({
  id: u.id,
  name: u.name,
  ...(u.phone ? { phone: u.phone } : {}),
  ...(u.telegramId ? { telegramId: u.telegramId } : {}),
  role: u.role as UserRole,
  ...(u.businessId ? { businessId: u.businessId } : {}),
});

export interface TelegramProfile {
  id: number;
  first_name?: string;
  last_name?: string;
}

const MAX_NAME = 80;
const telegramName = (p: TelegramProfile): string =>
  [p.first_name, p.last_name].map((s) => s?.trim() ?? '').filter(Boolean).join(' ').slice(0, MAX_NAME) || 'Telegram foydalanuvchi';

const isUniqueViolation = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

@Injectable()
export class AuthService implements OnModuleInit {
  private secret = '';

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Resolve the secret at boot (after PrismaClient has loaded .env). */
  onModuleInit(): void {
    this.key();
  }

  sign(user: DbUser): string {
    return signJwt({ sub: user.id, role: user.role }, this.key());
  }

  /**
   * One account per Telegram user, shared by the Mini App (POST /auth/telegram) and the bot, so plan and tokens are one.
   * Only call with an id that Telegram vouched for (verified initData, or a bot update). Never links to an existing phone account.
   */
  async telegramUser(profile: TelegramProfile): Promise<DbUser> {
    const telegramId = String(profile.id);
    const existing = await this.db.user.findUnique({ where: { telegramId } });
    if (existing) return existing;
    try {
      return await this.db.user.create({ data: { telegramId, name: telegramName(profile), role: 'user' } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return this.db.user.findUniqueOrThrow({ where: { telegramId } }); // a parallel first request created it
    }
  }

  async userFromToken(token: string): Promise<DbUser | null> {
    const payload = verifyJwt(token, this.key());
    return payload ? this.db.user.findFirst({ where: { id: payload.sub, deletedAt: null } }) : null;
  }

  private key(): string {
    if (this.secret) return this.secret;
    const fromEnv = process.env.AUTH_SECRET?.trim() ?? '';
    this.secret = fromEnv.startsWith('change-me') ? '' : fromEnv; // .env.example placeholder = not set
    if (!this.secret) {
      this.secret = randomBytes(32).toString('hex');
      new Logger('Auth').warn('AUTH_SECRET is not set — using a random secret, tokens become invalid after restart');
    }
    return this.secret;
  }
}
