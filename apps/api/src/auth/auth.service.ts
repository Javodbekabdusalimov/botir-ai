import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { AuthUser, UserRole } from '@botir/shared';
import { PrismaService } from '../db/prisma.service';
import { signJwt, verifyJwt } from './auth.util';

export const toAuthUser = (u: DbUser): AuthUser => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role as UserRole,
  ...(u.businessId ? { businessId: u.businessId } : {}),
});

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
