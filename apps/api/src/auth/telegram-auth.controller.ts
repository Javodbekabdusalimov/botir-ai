import { randomBytes } from 'node:crypto';
import { Body, Controller, Inject, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { AuthResponse } from '@botir/shared';
import { ok } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { AuthService, toAuthUser } from './auth.service';
import { hashPassword } from './auth.util';
import { verifyInitData } from './telegram-init-data';

/** Telegram orqali kirgan foydalanuvchi id'si. Bot muzokaralarni ham shu id bilan ochadi (`tg:<telegramId>`). */
export const tgUserId = (telegramId: number | string) => `tg:${telegramId}`;

/**
 * POST /auth/telegram {initData} — Mini App kirishi. initData TELEGRAM_BOT_TOKEN bilan tekshiriladi;
 * foydalanuvchi bo'lmasa yaratiladi (rol: mijoz, parol bilan kirib bo'lmaydi). Javob login bilan bir xil.
 */
@Controller('auth')
export class TelegramAuthController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post('telegram')
  async telegram(@Body() body: { initData?: unknown }) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new ServiceUnavailableException('Telegram orqali kirish serverda yoqilmagan');
    const tg = typeof body?.initData === 'string' ? verifyInitData(body.initData, token) : null;
    if (!tg) throw new UnauthorizedException("Telegram ma'lumoti tasdiqlanmadi, Mini App'ni qayta oching");

    const id = tgUserId(tg.id);
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim().slice(0, 80) || tg.username || 'Telegram foydalanuvchi';
    let user = await this.db.user.findUnique({ where: { id } });
    if (user?.deletedAt) throw new UnauthorizedException("Akkaunt o'chirilgan");
    if (!user) {
      user = await this.db.user.create({ data: { id, name, phone: id, role: 'user', passwordHash: hashPassword(randomBytes(32).toString('hex')) } });
    }
    return ok<AuthResponse>({ token: this.auth.sign(user), user: toAuthUser(user) });
  }
}
