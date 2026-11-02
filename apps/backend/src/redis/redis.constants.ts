import { Inject } from '@nestjs/common';

// A Symbol token prevents collisions with other providers that inject Redis clients.
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// Keeps the Redis client injection syntax consistent across the application.
export const InjectRedis = (): ParameterDecorator => Inject(REDIS_CLIENT);
