import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

import { InjectRedis } from './redis.constants.js';

const SCAN_COUNT = 100;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

// A prefix like `app[1]:` must match literally inside a SCAN pattern.
function escapeGlob(value: string): string {
  return value.replace(/[*?[\]\\]/g, '\\$&');
}

// JSON helpers over the shared client. Every key gets REDIS_KEY_PREFIX added by ioredis.
@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly client: Redis) {}

  // For pipelines, Lua scripts, streams, hashes, and duplicate() for Pub/Sub connections.
  getClient(): Redis {
    return this.client;
  }

  // The parsed value is only asserted to be T, not validated.
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  // undefined is not a valid JSON representation, so reject it rather than storing a false value.
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized: unknown = JSON.stringify(value);
    if (typeof serialized !== 'string') {
      throw new TypeError('Redis values must be JSON serializable');
    }

    if (ttlSeconds === undefined) {
      await this.client.set(key, serialized);
      return;
    }

    await this.client.set(key, serialized, 'EX', ttlSeconds);
  }

  // UNLINK, not DEL: Redis frees the values in a background thread instead of blocking.
  async del(...keys: string[]): Promise<number> {
    // UNLINK with no keys is a Redis error.
    if (keys.length === 0) {
      return 0;
    }
    return this.client.unlink(...keys);
  }

  // Deletes every key matching a glob `pattern` (written without REDIS_KEY_PREFIX) using SCAN
  // and UNLINK, so Redis is never blocked the way KEYS would block it. Not atomic: keys written
  // during the scan may survive.
  async delByPattern(pattern: string): Promise<number> {
    // ioredis prefixes UNLINK's keys but not SCAN's MATCH, and SCAN returns the full keys.
    // So the prefix is added to the pattern here and stripped from each key before UNLINK.
    const prefix = this.client.options.keyPrefix ?? '';
    const stream = this.client.scanStream({
      match: escapeGlob(prefix) + pattern,
      count: SCAN_COUNT,
    });
    const batches: AsyncIterable<unknown> = stream;

    let deleted = 0;
    // for await pulls the next batch only after the previous UNLINK has finished.
    for await (const batch of batches) {
      if (!isStringArray(batch)) {
        throw new TypeError('Redis SCAN stream produced an invalid batch');
      }
      // SCAN can return an empty batch before the cursor is done.
      if (batch.length > 0) {
        for (let offset = 0; offset < batch.length; offset += SCAN_COUNT) {
          const keys = batch.slice(offset, offset + SCAN_COUNT).map((key) => {
            if (prefix !== '' && !key.startsWith(prefix)) {
              throw new Error('Redis SCAN returned a key without the configured key prefix');
            }
            return key.slice(prefix.length);
          });
          deleted += await this.client.unlink(...keys);
        }
      }
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // Atomic SET key value EX ttl NX: true if the key was set, false if it already existed.
  // The value is stored raw, not as JSON, so read it back with getClient().get().
  async setNx(key: string, value: string | number, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  // Stores a raw string with an expiration, so Redis holds a String value and not JSON.
  // Read it back with getString().
  async setString(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  // Reads a raw string value; returns null when the key is missing or expired.
  async getString(key: string): Promise<string | null> {
    return this.client.get(key);
  }
}
