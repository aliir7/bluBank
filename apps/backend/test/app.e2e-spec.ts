import { RequestMethod, VersioningType } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';

import { AppConfigService } from './../src/config/app-config.service.js';

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
    }).compile();
    const config = moduleFixture.get(AppConfigService);

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        trustProxy: config.get('TRUST_PROXY'),
        bodyLimit: config.get('BODY_LIMIT_BYTES'),
      }),
    );
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
