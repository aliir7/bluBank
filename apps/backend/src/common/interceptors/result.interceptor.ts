import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiResponse, createSuccessResponse } from '../responses/api-response.js';

// Wraps every successful controller return value in the unified ApiResponse envelope.
@Injectable()
export class ResultInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return next.handle().pipe(map((data) => createSuccessResponse(data, request)));
  }
}
