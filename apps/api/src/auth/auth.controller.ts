import { BadRequestException, Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { AuthResponse, LoginDto, MeResponse, RegisterDto } from '@botir/shared';
import { BillingService, ownerOfUser } from '../billing/billing.service';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { Auth, CurrentUser } from './auth.guard';
import { AuthService, toAuthUser } from './auth.service';
import { hashPassword, normalizePhone, verifyPassword } from './auth.util';

const BAD_CREDENTIALS = "Telefon yoki parol noto'g'ri";

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Post('register')
  async register(@Body() dto: Partial<RegisterDto>) {
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    if (!name) throw new BadRequestException('Ism kiritilishi shart');
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException("Telefon raqami noto'g'ri (+998XXXXXXXXX)");
    if (typeof dto.password !== 'string' || dto.password.length < 6) throw new BadRequestException('Parol kamida 6 ta belgidan iborat bo‘lsin');
    if (dto.role !== 'business' && dto.role !== 'user') throw new BadRequestException("Rol 'business' yoki 'user' bo‘lishi kerak");
    if (await this.db.user.findUnique({ where: { phone } })) throw new BadRequestException("Bu telefon allaqachon ro'yxatdan o'tgan");
    const user = await this.db.user.create({ data: { name, phone, role: dto.role, passwordHash: hashPassword(dto.password) } });
    return ok<AuthResponse>(this.session(user));
  }

  @Post('login')
  async login(@Body() dto: Partial<LoginDto>) {
    const phone = normalizePhone(dto?.phone);
    const user = phone ? await this.db.user.findFirst({ where: { phone, deletedAt: null } }) : null;
    if (!user || typeof dto.password !== 'string' || !verifyPassword(dto.password, user.passwordHash)) {
      throw new BadRequestException(BAD_CREDENTIALS);
    }
    return ok<AuthResponse>(this.session(user));
  }

  /** The plan comes from the billing ledger (PlanAccount), the same one /billing/me returns, never from Business.plan. */
  @Get('me')
  @Auth()
  async me(@CurrentUser() user: DbUser) {
    const b = user.businessId ? await this.db.business.findFirst({ where: { id: user.businessId, deletedAt: null } }) : null;
    const p = b ? await this.billing.effectivePlan(ownerOfUser(user)) : null;
    return ok<MeResponse>({
      user: toAuthUser(user),
      ...(user.businessId ? { businessId: user.businessId } : {}),
      ...(b && p ? { business: { id: b.id, name: b.name, plan: p.plan, planUntil: p.expiresAt?.toISOString() ?? null, aiCredits: b.aiCredits } } : {}),
    });
  }

  private session(user: DbUser): AuthResponse {
    return { token: this.auth.sign(user), user: toAuthUser(user) };
  }
}
