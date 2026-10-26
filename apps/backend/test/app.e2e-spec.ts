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

const requestSchema = z.object({
  amount: z.coerce.number().int().positive(),
});

const validationResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  path: z.string(),
  timestamp: z.iso.datetime(),
  details: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
  requestId: z.string(),
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
    expect(response.json()).toEqual({ status: 'ok' });
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
    expect(response.json()).toEqual({ amount: 12 });
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
    const body = validationResponseSchema.parse(JSON.parse(response.body));

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      path: '/api/v1/test/body',
    });
    expect(body.details[0]?.path).toEqual(['amount']);
    expect(body.details[0]?.message).not.toBe('');
    expect(body.requestId).toBe(response.headers['x-request-id']);
  });

  it('preserves an AppException code and status', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/app-exception',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      error: 'ACCOUNT_LOCKED',
      message: 'Account is locked',
      requestId: response.headers['x-request-id'],
    });
  });

  it('formats a Nest HttpException with a machine-readable error code', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/http-exception',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      error: 'BAD_REQUEST',
      message: 'Invalid request',
      requestId: response.headers['x-request-id'],
    });
  });

  it('does not expose an unexpected error message', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/v1/test/error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('Sensitive internal details');
  });

  it('returns 404 for an unknown versioned API route', async () => {
    const response = await getApp().inject({ method: 'GET', url: '/api/v1/unknown' });

    expect(response.statusCode).toBe(404);
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
