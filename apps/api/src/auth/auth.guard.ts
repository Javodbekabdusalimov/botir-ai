import {
  applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from './auth.service';

type AuthedRequest = Request & { user?: DbUser };

/** Requires `Authorization: Bearer <token>`; puts the DB user on `req.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Avtorizatsiya kerak (Authorization: Bearer <token>)');
    const user = await this.auth.userFromToken(token);
    if (!user) throw new UnauthorizedException('Token yaroqsiz yoki muddati o‘tgan');
    req.user = user;
    return true;
  }
}

/** Route decorator: `@Auth()` = login required. */
export const Auth = () => applyDecorators(UseGuards(AuthGuard));

/** Param decorator: the authenticated DB user (use only together with `@Auth()`). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): DbUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException('Avtorizatsiya kerak');
  return user;
});
