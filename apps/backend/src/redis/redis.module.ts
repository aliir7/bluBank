import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigModule } from '../config/app-config.module.js';
import { AppConfigService } from '../config/app-config.service.js';
import { InjectRedis, REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

const MAX_RETRY_DELAY_MS = 2000;

// ioredis calls this with a 1-based retry count: 100, 200, 400, ... ms.
export function retryDelay(times: number): number {
  return Math.min(2 ** times * 50, MAX_RETRY_DELAY_MS);
}

function createRedisClient(config: AppConfigService): Redis {
  const host = config.get('REDIS_HOST');
  const port = config.get('REDIS_PORT');
  const database = config.get('REDIS_DB');

  // Keep a single lazily connected client and bound per-command retries during outages.
  const client = new Redis({
    host,
    port,
    password: config.get('REDIS_PASSWORD'),
    db: database,
    keyPrefix: config.get('REDIS_KEY_PREFIX'),
    retryStrategy: retryDelay,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  // ioredis errors otherwise have no application-level listener for structured reporting.
  const logger = new Logger('Redis');
  client.on('connect', () => {
    logger.log('TCP connection established');
  });
  client.on('ready', () => {
    logger.log('Redis connection ready');
  });
  client.on('error', (error: Error) => {
    logger.error(error.message, error.stack);
  });
  client.on('close', () => {
    logger.warn('connection closed');
  });
  client.on('reconnecting', (delay: number) => {
    logger.warn(`reconnecting in ${delay.toString()}ms`);
  });

  logger.log(`connecting to Redis at ${host}:${port.toString()} (db ${database.toString()})`);
  void client.connect().catch((error: unknown) => {
    logger.error(
      `initial connection failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
  });

  return client;
}

// Redis is shared globally so feature modules can inject RedisService without re-importing it.
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: createRedisClient,
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@InjectRedis() private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // A client that never connected or already ended cannot be gracefully quit.
    if (this.client.status === 'wait' || this.client.status === 'end') {
      this.client.disconnect();
      return;
    }

    try {
      // QUIT waits for outstanding Redis replies before closing the connection.
      await this.client.quit();
    } catch (error) {
      // Fall back to closing the socket if Redis cannot complete a graceful shutdown.
      this.logger.warn(`quit failed, disconnecting: ${String(error)}`);
      this.client.disconnect();
    }
  }
}
