import { RedisService } from '../redis/redis.service.js';
import { challengeSchema } from './dto/challenge.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let redis: RedisService;
  const setString = vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<void>>();

  beforeEach(() => {
    redis = { setString } as unknown as RedisService;
    service = new EnrollmentsService(redis);
  });

  it('returns the phone and expiresIn for a valid Iranian phone number', async () => {
    setString.mockResolvedValue(undefined);
    const result = await service.createChallenge({ phone: '09121234567' });

    expect(result.phone).toBe('09121234567');
    expect(result.expiresIn).toBe(120);
    expect(setString).toHaveBeenCalledOnce();
    const [key, value, ttl] = setString.mock.calls[0] ?? [];
    expect(key).toMatch(/^otp:[0-9a-f-]{36}$/);
    expect(value).toMatch(/^[1-9]\d{5}$/);
    expect(ttl).toBe(120);
  });

  it('uses a different Redis key for every request', async () => {
    setString.mockResolvedValue(undefined);
    await service.createChallenge({ phone: '09121234567' });
    await service.createChallenge({ phone: '09121234567' });

    const keys = setString.mock.calls.map(([callKey]) => callKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('propagates Redis errors', async () => {
    setString.mockRejectedValue(new Error('Redis down'));
    await expect(service.createChallenge({ phone: '09121234567' })).rejects.toThrow('Redis down');
  });
});

describe('challengeSchema', () => {
  it.each(['09121234567', ' 0912 123 4567 ', '9121234567'])('accepts %s', (phone) => {
    const parsed = challengeSchema.parse({ phone });
    expect(parsed.phone).toBe(phone.trim().replace(/\s+/g, ''));
  });

  it('accepts +98 prefix without normalization', () => {
    const parsed = challengeSchema.parse({ phone: '+989121234567' });
    expect(parsed.phone).toBe('+989121234567');
  });

  it.each(['0912123456', '08121234567', '+19121234567', '0912abc4567', ''])(
    'rejects %s',
    (phone) => {
      expect(challengeSchema.safeParse({ phone }).success).toBe(false);
    },
  );
});
