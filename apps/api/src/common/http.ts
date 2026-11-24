import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse } from '@botir/shared';

export const ok = <T>(data: T): ApiResponse<T> => ({ ok: true, data });

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Every error → `{ ok:false, error }` (shared ApiResponse). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal error';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      error = typeof body === 'string' ? body : String((body as { message?: unknown }).message ?? exception.message);
    } else {
      this.logger.error(errMsg(exception));
    }
    res.status(status).json({ ok: false, error } satisfies ApiResponse<never>);
  }
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
