import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const configContext = await NestFactory.createApplicationContext(AppConfigModule);
  const bootConfig = configContext.get(AppConfigService);
  const adapter = new FastifyAdapter({
    // trustProxy determines whether request.ip honors forwarded headers from proxies.
    trustProxy: bootConfig.get('TRUST_PROXY'),
    bodyLimit: bootConfig.get('BODY_LIMIT_BYTES'),
  });
  await configContext.close();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
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
}
await bootstrap();
