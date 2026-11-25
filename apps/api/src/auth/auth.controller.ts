import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { AuthResponse, LoginDto, MeResponse, RegisterDto, TelegramAuthDto } from '@botir/shared';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { effectivePlan } from '../payments/plans';
import { Auth, CurrentUser } from './auth.guard';
import { AuthService, toAuthUser } from './auth.service';
import { hashPassword, normalizePhone, verifyPassword } from './auth.util';
import { verifyInitData, type InitDataResult } from './telegram-init-data';

const BAD_CREDENTIALS = "Telefon yoki parol noto'g'ri";
const TELEGRAM_REJECTED: Record<Extract<InitDataResult, { ok: false }>['reason'], string> = {
  malformed: "Telegram ma'lumoti noto'g'ri",
  bad_hash: "Telegram imzosi noto'g'ri",
  expired: 'Telegram sessiyasi eskirgan, Mini App ni qayta oching',
  no_user: 'Telegram foydalanuvchisi topilmadi',
};

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
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
    // A Telegram-only account has no password: it can never sign in here.
    if (!user?.passwordHash || typeof dto.password !== 'string' || !verifyPassword(dto.password, user.passwordHash)) {
      throw new BadRequestException(BAD_CREDENTIALS);
    }
    return ok<AuthResponse>(this.session(user));
  }

  /** Telegram Mini App sign-in: initData signature checked with the bot token, never trusted unchecked. */
  @Post('telegram')
  @HttpCode(200)
  async telegram(@Body() dto: Partial<TelegramAuthDto>) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
    if (!botToken) throw new ServiceUnavailableException('Telegram orqali kirish hozircha yoqilmagan');
    const res = verifyInitData(dto?.initData, botToken);
    if (!res.ok) throw new UnauthorizedException(TELEGRAM_REJECTED[res.reason]);
    const user = await this.auth.telegramUser(res.user);
    if (user.deletedAt) throw new UnauthorizedException('Akkaunt o‘chirilgan');
    return ok<AuthResponse>(this.session(user));
  }

  @Get('me')
  @Auth()
  async me(@CurrentUser() user: DbUser) {
    const b = user.businessId ? await this.db.business.findFirst({ where: { id: user.businessId, deletedAt: null } }) : null;
    return ok<MeResponse>({
      user: toAuthUser(user),
      ...(user.businessId ? { businessId: user.businessId } : {}),
      ...(b ? { business: { id: b.id, name: b.name, plan: effectivePlan(b), planUntil: b.planUntil?.toISOString() ?? null, aiCredits: b.aiCredits } } : {}),
    });
  }

  private session(user: DbUser): AuthResponse {
    return { token: this.auth.sign(user), user: toAuthUser(user) };
  }
}
