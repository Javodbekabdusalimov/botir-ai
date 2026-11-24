import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('telegram')
  login(@Body() dto: TelegramAuthDto): Promise<{ token: string; userId: string }> {
    return this.auth.loginWithTelegram(dto);
  }
}
