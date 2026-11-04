import { STATUS_CODES } from 'node:http';

import { SetMetadata } from '@nestjs/common';
import { ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';
import { z } from 'zod';

import type { ApiError, ApiMeta } from '../responses/api-response.js';

// ─── Shared Zod mirrors of the unified ApiResponse envelope (api-response.ts) ───
// .meta({ id }) registers each as a named OpenAPI component, so they are never
// repeated per-route. Type annotations tie them to the TS interfaces → no drift.

const metaSchema: z.ZodType<ApiMeta> = z
  .object({
    path: z.string(),
    timestamp: z.iso.datetime(),
    requestId: z.string(),
  })
  .meta({ id: 'ResponseMeta' });

const errorSchema: z.ZodType<ApiError> = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .meta({ id: 'ApiError' });

// Single factory for both envelope variants — success or failure.
// `dataSchema` is only used for the success branch; failure always has data: null.
const envelopeSchema = (success: boolean, dataSchema?: z.ZodType) =>
  z.object({
    success: z.literal(success),
    data: success ? (dataSchema ?? z.null()) : z.null(),
    error: success ? z.null() : errorSchema,
    meta: metaSchema,
  });

// ─── Decorators ───

/** Documents a Bearer/JWT auth requirement on a route. Usage: @ApiAuth('Authorization') */
export function ApiAuth(...names: string[]) {
  return SetMetadata('apiAuth', names);
}

/**
 * Documents a success response wrapped in the unified ApiResponse envelope.
 * Usage: @ApiSuccess(HttpStatus.OK, userSchema)  |  @ApiSuccess(HttpStatus.NO_CONTENT)
 */
export function ApiSuccess(
  status: number,
  dataSchema?: z.ZodType,
): MethodDecorator & ClassDecorator {
  const options: ApiResponseOptions = {
    status,
    description: STATUS_CODES[status],
    standardSchema: envelopeSchema(true, dataSchema).meta({ id: undefined }),
  };
  return ApiResponse(options);
}

/**
 * Documents an error response wrapped in the unified ApiResponse envelope.
 * Usage: @ApiFailure(HttpStatus.BAD_REQUEST)
 */
export function ApiFailure(status: number): MethodDecorator & ClassDecorator {
  const options: ApiResponseOptions = {
    status,
    description: STATUS_CODES[status],
    standardSchema: envelopeSchema(false).meta({ id: 'ApiFailure' }),
  };
  return ApiResponse(options);
}

/**
 * Documents a paginated list response (envelope + array data + pagination meta).
 * Usage: @ApiPaginated(HttpStatus.OK, itemSchema)
 */
export function ApiPaginated(
  status: number,
  itemSchema: z.ZodType,
): MethodDecorator & ClassDecorator {
  const dataSchema = z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      currentPage: z.number().int().min(1),
      perPage: z.number().int().min(1).max(100),
      totalItems: z.number().int().min(0),
      totalPages: z.number().int().min(0),
    }),
  });
  return ApiSuccess(status, dataSchema);
}

/** Query-param schema for pagination endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
});
