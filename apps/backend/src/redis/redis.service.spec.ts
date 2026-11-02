import { Redis } from 'ioredis';

import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let client: Redis;
  let service: RedisService;

  beforeEach(() => {
    client = new Redis({ lazyConnect: true });
    service = new RedisService(client);
  });

  afterEach(() => {
    client.disconnect();
  });

  it('exposes the raw Redis client', () => {
    expect(service.getClient()).toBe(client);
  });

  it('deserializes JSON values and returns null for missing keys', async () => {
    vi.spyOn(client, 'get').mockResolvedValueOnce('{"active":true}').mockResolvedValueOnce(null);

    await expect(service.get<{ active: boolean }>('profile')).resolves.toEqual({ active: true });
    await expect(service.get('missing')).resolves.toBeNull();
  });

  it('serializes values with and without an expiration', async () => {
    const set = vi.spyOn(client, 'set').mockResolvedValue('OK');

    await service.set('profile', { active: true });
    await service.set('temporary', [1, 2], 30);

    expect(set).toHaveBeenNthCalledWith(1, 'profile', '{"active":true}');
    expect(set).toHaveBeenNthCalledWith(2, 'temporary', '[1,2]', 'EX', 30);
  });

  it('uses UNLINK for deletion and skips the command for empty arguments', async () => {
    const unlink = vi.spyOn(client, 'unlink').mockResolvedValue(2);

    await expect(service.del('one', 'two')).resolves.toBe(2);
    await expect(service.del()).resolves.toBe(0);

    expect(unlink).toHaveBeenCalledOnce();
    expect(unlink).toHaveBeenCalledWith('one', 'two');
  });

  it('deletes keys incrementally across scan batches and skips empty batches', async () => {
    const keys = Array.from({ length: 205 }, (_, index) => `key:${String(index)}`);
    const stream = createStream(client, [keys.slice(0, 100), [], keys.slice(100)]);
    const scanStream = vi.spyOn(client, 'scanStream').mockReturnValue(stream);
    const unlink = vi
      .spyOn(client, 'unlink')
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(5);

    await expect(service.delByPattern('key:*')).resolves.toBe(205);

    expect(scanStream).toHaveBeenCalledWith({ match: 'key:*', count: 100 });
    expect(unlink).toHaveBeenCalledTimes(3);
    expect(unlink.mock.calls.map((batch) => batch.length)).toEqual([100, 100, 5]);
  });

  it('escapes the configured key prefix and removes it before UNLINK', async () => {
    client.disconnect();
    client = new Redis({ lazyConnect: true, keyPrefix: 'cache:*?[x]\\' });
    service = new RedisService(client);
    const stream = createStream(client, [['cache:*?[x]\\users:1']]);
    const scanStream = vi.spyOn(client, 'scanStream').mockReturnValue(stream);
    const unlink = vi.spyOn(client, 'unlink').mockResolvedValue(1);

    await expect(service.delByPattern('users:*')).resolves.toBe(1);

    expect(scanStream).toHaveBeenCalledWith({
      match: 'cache:\\*\\?\\[x\\]\\\\users:*',
      count: 100,
    });
    expect(unlink).toHaveBeenCalledWith('users:1');
  });

  it('converts EXISTS results to booleans', async () => {
    vi.spyOn(client, 'exists').mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(service.exists('present')).resolves.toBe(true);
    await expect(service.exists('missing')).resolves.toBe(false);
  });

  it('uses atomic SET EX NX and reports successful creation', async () => {
    const set = vi.spyOn(client, 'set').mockResolvedValue('OK');

    await expect(service.setNx('lock', 42, 15)).resolves.toBe(true);

    expect(set).toHaveBeenNthCalledWith(1, 'lock', 42, 'EX', 15, 'NX');
  });

  it('propagates UNLINK failures during pattern deletion', async () => {
    const stream = createStream(client, [['key:1']]);
    vi.spyOn(client, 'scanStream').mockReturnValue(stream);
    const unlinkError = new Error('UNLINK failed');
    vi.spyOn(client, 'unlink').mockRejectedValue(unlinkError);

    await expect(service.delByPattern('key:*')).rejects.toBe(unlinkError);
  });

  it('propagates Redis command and stream errors', async () => {
    const commandError = new Error('Redis command failed');
    vi.spyOn(client, 'get').mockRejectedValue(commandError);
    await expect(service.get('key')).rejects.toBe(commandError);

    const stream = createStream(client, []);
    vi.spyOn(client, 'scanStream').mockReturnValue(stream);
    const deletion = service.delByPattern('*');
    queueMicrotask(() => stream.destroy(new Error('Redis stream failed')));
    await expect(deletion).rejects.toThrow('Redis stream failed');
  });
});

function createStream(client: Redis, batches: string[][]): ReturnType<Redis['scanStream']> {
  const stream = client.scanStream();
  let index = 0;
  // Feed deterministic SCAN batches through a real Readable stream without Redis.
  stream._read = () => {
    const batch = batches[index];
    index += 1;
    stream.push(batch ?? null);
  };
  return stream;
}
