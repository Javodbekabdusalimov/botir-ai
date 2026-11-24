import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** Wraps every successful payload into the contract shape { ok: true, data }. */
@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, { ok: true; data: T }> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<{ ok: true; data: T }> {
    return next.handle().pipe(map((data) => ({ ok: true as const, data })));
  }
}
