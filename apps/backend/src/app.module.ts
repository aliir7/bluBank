import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResultInterceptor } from './common/interceptors/result.interceptor.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { HealthController } from './health.controller.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    AppConfigModule,
    EnrollmentsModule,
    RedisModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'headers.authorization',
              'headers.cookie',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResultInterceptor },
  ],
})
export class AppModule {}
