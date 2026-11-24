import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { MeTgConnectStartDto, TgConnectCodeDto } from '@botir/shared';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { ok } from '../common/http';
import { TgUserService } from './tg-user.service';
import { TgService, type TgOwner } from './tg.service';

const me = (user: DbUser): TgOwner => ({ type: 'user', id: user.id });

/** B2C: the logged-in user connects THEIR OWN Telegram (phone → code → 2FA) and approves AI actions. */
@Controller('me')
@Auth()
export class MeTgController {
  constructor(
    @Inject(TgService) private readonly tg: TgService,
    @Inject(TgUserService) private readonly user: TgUserService,
  ) {}

  @Post('tg-connect/start')
  async start(@CurrentUser() user: DbUser, @Body() dto: Partial<MeTgConnectStartDto>) {
    if (typeof dto?.phone !== 'string' || !dto.phone) throw new BadRequestException('phone is required');
    return ok(await this.tg.start(me(user), dto.phone));
  }

  @Post('tg-connect/code')
  async code(@CurrentUser() user: DbUser, @Body() dto: Partial<TgConnectCodeDto>) {
    if (typeof dto?.loginId !== 'string' || typeof dto.code !== 'string') throw new BadRequestException('loginId and code are required');
    return ok(await this.tg.code(dto.loginId, dto.code, typeof dto.password === 'string' ? dto.password : undefined, me(user)));
  }

  @Get('tg-connect')
  async status(@CurrentUser() user: DbUser) {
    return ok(await this.tg.status(me(user)));
  }

  @Delete('tg-connect')
  async disconnect(@CurrentUser() user: DbUser) {
    return ok(await this.tg.disconnect(me(user)));
  }

  @Get('actions')
  async actions(@CurrentUser() user: DbUser) {
    return ok(await this.user.pending(user.id));
  }

  @Post('actions/:id/approve')
  async approve(@CurrentUser() user: DbUser, @Param('id') id: string) {
    return ok(await this.user.decide(user.id, id, true));
  }

  @Post('actions/:id/reject')
  async reject(@CurrentUser() user: DbUser, @Param('id') id: string) {
    return ok(await this.user.decide(user.id, id, false));
  }
}
