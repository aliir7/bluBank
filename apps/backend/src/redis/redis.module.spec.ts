import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';

import { AppConfigService } from '../config/app-config.service.js';
import { REDIS_CLIENT } from './redis.constants.js';

type RedisModuleExports = typeof import('./redis.module.js');

let redisModule: RedisModuleExports | undefined;

beforeAll(async () => {
  // ConfigModule validates NODE_ENV during module evaluation in this test environment.
  vi.stubEnv('NODE_ENV', 'development');
  redisModule = await import('./redis.module.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// Import after stubbing NODE_ENV so the ConfigModule validates a supported environment.
function getRedisModule(): RedisModuleExports {
  if (!redisModule) {
    throw new Error('RedisModule test imports have not initialized');
  }
  return redisModule;
}

describe('RedisModule', () => {
  it('uses exponential retry delays capped at 2000 milliseconds', () => {
    const { retryDelay } = getRedisModule();

    expect([1, 2, 3, 4, 5, 6, 10].map(retryDelay)).toEqual([100, 200, 400, 800, 1600, 2000, 2000]);
  });

  it('creates one Redis client with the configured connection settings', async () => {
    const configValues = {
      REDIS_HOST: 'redis.example',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'secret',
      REDIS_DB: 2,
      REDIS_KEY_PREFIX: 'test:',
    } as const;
    const connect = vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const testingModule = await Test.createTestingModule({
      imports: [getRedisModule().RedisModule],
    })
      .overrideProvider(AppConfigService)
      .useValue({
        get: (key: keyof typeof configValues) => configValues[key],
      })
      .compile();
    const client = testingModule.get<Redis>(REDIS_CLIENT);

    expect(client.options.host).toBe('redis.example');
    expect(client.options.port).toBe(6380);
    expect(client.options.password).toBe('secret');
    expect(client.options.db).toBe(2);
    expect(client.options.keyPrefix).toBe('test:');
    expect(client.options.maxRetriesPerRequest).toBe(3);
    expect(client.options.enableReadyCheck).toBe(true);
    expect(client.options.lazyConnect).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('connecting to Redis at redis.example:6380 (db 2)');

    await testingModule.close();
    connect.mockRestore();
    log.mockRestore();
  });

  it.each(['wait', 'end'] as const)('disconnects immediately for status %s', async (status) => {
    const { RedisModule } = getRedisModule();
    const client = createMockClient(status);
    const disconnect = vi.spyOn(client, 'disconnect');
    const module = new RedisModule(client);

    await module.onApplicationShutdown();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('quits a connected client', async () => {
    const { RedisModule } = getRedisModule();
    const client = createMockClient('ready');
    const quit = vi.spyOn(client, 'quit').mockResolvedValue('OK');
    const disconnect = vi.spyOn(client, 'disconnect');
    const module = new RedisModule(client);

    await module.onApplicationShutdown();

    expect(quit).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('falls back to disconnect if QUIT fails', async () => {
    const { RedisModule } = getRedisModule();
    const client = createMockClient('ready');
    const quitError = new Error('QUIT failed');
    const quit = vi.spyOn(client, 'quit').mockRejectedValue(quitError);
    const disconnect = vi.spyOn(client, 'disconnect');
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const module = new RedisModule(client);

    await expect(module.onApplicationShutdown()).resolves.toBeUndefined();

    expect(quit).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(`quit failed, disconnecting: ${String(quitError)}`);
  });
});

function createMockClient(status: Redis['status']): Redis {
  const client = new Redis({ lazyConnect: true });
  // Simulate lifecycle states without opening a network connection.
  Object.defineProperty(client, 'status', { configurable: true, value: status });
  return client;
}
