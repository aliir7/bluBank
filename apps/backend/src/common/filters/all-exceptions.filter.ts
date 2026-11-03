import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AppException } from '../exceptions/app-exception.js';
import { ApiResponse, createErrorResponse } from '../responses/api-response.js';

// Describe the exception with an HTTP status and a structured error payload.
interface DescribedException {
  statusCode: number;
  error: { code: string; message: string; details?: unknown };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const described = this.describe(exception);
    const body: ApiResponse<null> = createErrorResponse(described.error, request);
    void reply.status(described.statusCode).send(body);
  }

  private describe(exception: unknown): DescribedException {
    // AppException: explicitly designated client-facing error — expose full message and details
    if (exception instanceof AppException) {
      return {
        statusCode: exception.status,
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
      };
    }

    // Nest HttpException subclasses: keep status code but use generic message
    if (exception instanceof HttpException) {
      return {
        statusCode: exception.getStatus(),
        error: {
          code: toErrorCode(exception),
          message: 'Request failed',
        },
      };
    }

    // All other exceptions: generic server error, no internal details exposed
    this.logger.error(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'A server error occurred.',
      },
    };
  }
}

function toErrorCode(exception: HttpException): string {
  if (exception.constructor === HttpException) {
    return HttpStatus[exception.getStatus()] ?? 'HTTP_ERROR';
  }
  return exception.name
    .replace(/Exception$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
}
