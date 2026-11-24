import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Every failure leaves as { ok: false, error } with no stack trace exposed. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = this.describe(exception, status);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(error, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(status).json({ ok: false, error });
  }

  private describe(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') return body;
      const message = (body as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join('; ');
      if (typeof message === 'string') return message;
      return exception.message;
    }
    return status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'internal error' : 'request failed';
  }
}
