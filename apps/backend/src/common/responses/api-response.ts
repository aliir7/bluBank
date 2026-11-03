import { FastifyRequest } from 'fastify';

export interface ApiMeta {
  timestamp: string;
  requestId: string;
  path: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Single unified response envelope used for both success and error responses.
// - success: true  → data contains the payload, error is null
// - success: false → data is null, error contains the error details
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

export function createSuccessResponse<T>(data: T, request: FastifyRequest): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id,
      path: request.url,
    },
  };
}

export function createErrorResponse(error: ApiError, request: FastifyRequest): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id,
      path: request.url,
    },
  };
}
