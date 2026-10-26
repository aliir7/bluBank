import { IncomingMessage } from 'node:http';
import { Http2ServerRequest } from 'node:http2';

import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './logging/request-id.js';

async function bootstrap(): Promise<void> {
  const configContext = await NestFactory.createApplicationContext(AppConfigModule, {
    logger: ['error', 'warn'],
  });
  const bootConfig = configContext.get(AppConfigService);
  const adapter = new FastifyAdapter({
    genReqId: (request: IncomingMessage | Http2ServerRequest) =>
      resolveRequestId(request.headers[REQUEST_ID_HEADER]),
    // trustProxy determines whether request.ip honors forwarded headers from proxies.
    trustProxy: bootConfig.get('TRUST_PROXY'),
    bodyLimit: bootConfig.get('BODY_LIMIT_BYTES'),
  });
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
  await configContext.close();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  const nestLogger = app.get(Logger);
  app.useLogger(nestLogger);
  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({ origin: config.get('CORS_ORIGINS') });
  app.enableShutdownHooks();
  await app.listen(config.get('PORT'), config.get('HOST'));
  nestLogger.log(`application is running on ${config.get('PORT').toString()}`, 'Bootstrap');
}
await bootstrap();
