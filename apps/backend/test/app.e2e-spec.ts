import { IncomingMessage } from 'node:http';
import { Http2ServerRequest } from 'node:http2';

import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { z } from 'zod';

import { AppException } from './../src/common/exceptions/app-exception.js';
import { ZodValidationPipe } from './../src/common/pipes/zod-validation.pipe.js';
import { AppConfigService } from './../src/config/app-config.service.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './../src/logging/request-id.js';
import { RedisService } from './../src/redis/redis.service.js';

const requestSchema = z.object({
  amount: z.coerce.number().int().positive(),
});

const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ amount: z.number() }),
  error: z.null(),
  meta: z.object({
    timestamp: z.iso.datetime(),
    requestId: z.string(),
    path: z.string(),
  }),
});

const errorResponseSchema = z.object({
  success: z.literal(false),
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  meta: z.object({
    timestamp: z.iso.datetime(),
    requestId: z.string(),
    path: z.string(),
  }),
});

const healthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ status: z.literal('ok') }),
  error: z.null(),
  meta: z.object({
    timestamp: z.iso.datetime(),
    requestId: z.string(),
    path: z.string(),
  }),
});

@Controller('test')
class ValidationTestController {
  @Post('body')
  body(@Body(new ZodValidationPipe(requestSchema)) body: z.output<typeof requestSchema>) {
    return body;
  }

  @Post('app-exception')
  appException(): never {
    throw new AppException('ACCOUNT_LOCKED', HttpStatus.CONFLICT, 'Account is locked');
  }

  @Post('http-exception')
  httpException(): never {
    throw new BadRequestException('Invalid request');
  }

  @Post('error')
  error(): never {
    throw new Error('Sensitive internal details');
  }
}

describe('HTTP conventions (e2e)', () => {
  let app: NestFastifyApplication | undefined;

  function getApp(): NestFastifyApplication {
    if (!app) {
      throw new Error('Test application has not been initialized');
    }
    return app;
  }

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    }).compile();
    const config = moduleFixture.get(AppConfigService);

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        genReqId: (request: IncomingMessage | Http2ServerRequest) =>
          resolveRequestId(request.headers[REQUEST_ID_HEADER]),
        trustProxy: config.get('TRUST_PROXY'),
        bodyLimit: config.get('BODY_LIMIT_BYTES'),
      }),
    );
    app.useLogger(app.get(Logger));
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header(REQUEST_ID_HEADER, request.id);
      });
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.enableCors({ origin: ['https://allowed.example'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/health (GET)', async () => {
    const response = await getApp().inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: 'ok' });
    expect(body.error).toBeNull();
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns the parsed body from the validation pipe and echoes a valid request id', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/body',
      headers: { 'x-request-id': 'client-request_42' },
      payload: { amount: '12' },
    });

    expect(response.statusCode).toBe(201);
    const body = successResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ amount: 12 });
    expect(body.error).toBeNull();
    expect(body.meta.requestId).toBe('client-request_42');
    expect(response.headers['x-request-id']).toBe('client-request_42');
  });

  it('replaces unsafe or overlong incoming request ids', async () => {
    for (const requestId of ['unsafe request id', 'x'.repeat(65)]) {
      const response = await getApp().inject({
        method: 'POST',
        url: '/api/v1/test/body',
        headers: { 'x-request-id': requestId },
        payload: { amount: 12 },
      });

      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('formats validation errors with issue details and a request id', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/body',
      payload: { amount: 'invalid' },
    });
    const body = errorResponseSchema.parse(JSON.parse(response.body));

    expect(response.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
    });
    const details = body.error.details as unknown[];
    expect(details).toHaveLength(1);
    const detail = details[0] as { path: unknown; message: unknown };
    expect(detail.path).toEqual(['amount']);
    expect(typeof detail.message).toBe('string');
    expect((detail.message as string).length).toBeGreaterThan(0);
    expect(body.meta.path).toBe('/api/v1/test/body');
    expect(body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('preserves an AppException code and status', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/app-exception',
    });

    expect(response.statusCode).toBe(409);
    const body = errorResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      message: 'Account is locked',
    });
    expect(body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('formats a Nest HttpException with a machine-readable error code', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/http-exception',
    });

    expect(response.statusCode).toBe(400);
    const body = errorResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Request failed',
    });
    expect(body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('does not expose an unexpected error message', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/error',
    });

    expect(response.statusCode).toBe(500);
    const body = errorResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'A server error occurred.',
    });
    expect(body.meta.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('Sensitive internal details');
  });

  it('returns 404 for an unknown versioned API route', async () => {
    const response = await getApp().inject({ method: 'GET', url: '/api/v1/unknown' });

    expect(response.statusCode).toBe(404);
    const body = errorResponseSchema.parse(JSON.parse(response.body));
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns CORS headers only for allowed origins', async () => {
    const allowedResponse = await getApp().inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://allowed.example' },
    });
    const blockedResponse = await getApp().inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://blocked.example' },
    });

    expect(allowedResponse.headers['access-control-allow-origin']).toBe('https://allowed.example');
    expect(blockedResponse.headers['access-control-allow-origin']).toBeUndefined();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
});

describe('Enrollments challenge (e2e)', () => {
  let app: NestFastifyApplication | undefined;
  const setString = vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<void>>();

  function getApp(): NestFastifyApplication {
    if (!app) {
      throw new Error('Test application has not been initialized');
    }
    return app;
  }

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'development');
    setString.mockResolvedValue(undefined);
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue({ setString } satisfies Partial<RedisService>)
      .compile();
    const config = moduleFixture.get(AppConfigService);

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        genReqId: (request: IncomingMessage | Http2ServerRequest) =>
          resolveRequestId(request.headers[REQUEST_ID_HEADER]),
        trustProxy: config.get('TRUST_PROXY'),
        bodyLimit: config.get('BODY_LIMIT_BYTES'),
      }),
    );
    app.useLogger(app.get(Logger));
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header(REQUEST_ID_HEADER, request.id);
      });
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('stores the OTP in Redis under a unique key with a 2 minute TTL and returns 200', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/enrollments/challenge',
      payload: { phone: '09121234567' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      success: boolean;
      data: { phone: string; expiresIn: number };
      error: unknown;
    };
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data).toEqual({ phone: '09121234567', expiresIn: 120 });

    expect(setString).toHaveBeenCalledOnce();
    const [key, value, ttl] = setString.mock.calls[0] ?? [];
    expect(key).toMatch(/^otp:[0-9a-f-]{36}$/);
    expect(value).toMatch(/^[1-9]\d{5}$/);
    expect(ttl).toBe(120);
  });

  it('uses a different Redis key for every request', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/v1/enrollments/challenge',
      payload: { phone: '09121234567' },
    });
    await getApp().inject({
      method: 'POST',
      url: '/api/v1/enrollments/challenge',
      payload: { phone: '09121234567' },
    });

    const keys = setString.mock.calls.map(([callKey]) => callKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('rejects an invalid Iranian phone number with a validation error', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/enrollments/challenge',
      payload: { phone: '08121234567' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as {
      success: boolean;
      data: unknown;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(setString).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    setString.mockReset();
  });
});
