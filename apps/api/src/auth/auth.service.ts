import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthDto } from './dto';
import { verifyTelegramLogin } from './telegram-login';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async loginWithTelegram(dto: TelegramAuthDto): Promise<{ token: string; userId: string }> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (botToken) {
      const ok = verifyTelegramLogin({ ...dto, hash: dto.hash ?? '' }, botToken);
      if (!ok) throw new UnauthorizedException('invalid telegram signature');
    } else {
      // Local demo only: without a bot token there is nothing to verify against.
      // Never ship this branch to a public deployment.
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set — accepting login without signature check');
    }

    const name = [dto.first_name, dto.last_name].filter(Boolean).join(' ') || dto.username || 'Foydalanuvchi';
    const user = await this.prisma.user.upsert({
      where: { tgId: dto.id },
      update: { name },
      create: { tgId: dto.id, name },
    });

    return { token: await this.jwt.signAsync({ sub: user.id }), userId: user.id };
  }
}
