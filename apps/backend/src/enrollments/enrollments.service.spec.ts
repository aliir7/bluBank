import { RedisService } from '../redis/redis.service.js';
import { challengeSchema } from './dto/challenge.dto.js';
import { verifySchema } from './dto/verify.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let redis: RedisService;
  const setString = vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<void>>();
  const evalFn =
    vi.fn<
      (script: string, numKeys: number, ...keysAndArgs: (string | number)[]) => Promise<number>
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    redis = { setString, eval: evalFn } as unknown as RedisService;
    service = new EnrollmentsService(redis);
  });

  describe('createChallenge', () => {
    it('returns the phone and expiresIn for a valid Iranian phone number', async () => {
      setString.mockResolvedValue(undefined);
      const result = await service.createChallenge({ phone: '09121234567' });

      expect(result.phone).toBe('09121234567');
      expect(result.expiresIn).toBe(120);
      expect(setString).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = setString.mock.calls[0] ?? [];
      expect(key).toBe('enrollment:otp:09121234567');
      expect(value).toMatch(/^[1-9]\d{5}$/);
      expect(ttl).toBe(120);
    });

    it('replaces the previous code for the same phone number', async () => {
      setString.mockResolvedValue(undefined);
      await service.createChallenge({ phone: '09121234567' });
      await service.createChallenge({ phone: '09121234567' });

      expect(setString).toHaveBeenCalledTimes(2);
      // Both calls use the same key (deterministic per phone)
      const keys = setString.mock.calls.map(([callKey]) => callKey);
      expect(new Set(keys).size).toBe(1);
    });

    it('propagates Redis errors', async () => {
      setString.mockRejectedValue(new Error('Redis down'));
      await expect(service.createChallenge({ phone: '09121234567' })).rejects.toThrow('Redis down');
    });
  });

  describe('verifyChallenge', () => {
    const phone = '09121234567';
    const otp = '123456';
    const key = `enrollment:otp:${phone}`;

    beforeEach(() => {
      evalFn.mockResolvedValue(1); // 1 = deleted (match)
    });

    it('returns verified: true when OTP matches (atomic eval returns 1)', async () => {
      const result = await service.verifyChallenge({ phone, otp });

      expect(result).toEqual({ verified: true });
      expect(evalFn).toHaveBeenCalledTimes(1);
      const [script, numKeys, evalKey, evalOtp] = evalFn.mock.calls[0] ?? [];
      expect(script).toContain('GET');
      expect(script).toContain('DEL');
      expect(numKeys).toBe(1);
      expect(evalKey).toBe(key);
      expect(evalOtp).toBe(otp);
    });

    it('throws AppException when OTP does not exist (eval returns 0)', async () => {
      evalFn.mockResolvedValue(0);

      await expect(service.verifyChallenge({ phone, otp: '000000' })).rejects.toThrow(
        'کد وارد شده نادرست است یا منقضی شده است.',
      );

      expect(evalFn).toHaveBeenCalledTimes(1);
    });

    it('throws AppException when OTP has expired (eval returns 0, same as missing)', async () => {
      evalFn.mockResolvedValue(0);

      await expect(service.verifyChallenge({ phone, otp: '000000' })).rejects.toThrow(
        'کد وارد شده نادرست است یا منقضی شده است.',
      );
    });

    it('throws AppException when OTP is incorrect (same message, no info leak)', async () => {
      evalFn.mockResolvedValue(0);

      await expect(service.verifyChallenge({ phone, otp: '000000' })).rejects.toThrow(
        'کد وارد شده نادرست است یا منقضی شده است.',
      );
    });

    it('consumes the OTP on successful verification (cannot replay)', async () => {
      await service.verifyChallenge({ phone, otp });

      // Second attempt should fail because Lua script only deletes on match
      evalFn.mockResolvedValue(0);
      await expect(service.verifyChallenge({ phone, otp })).rejects.toThrow(
        'کد وارد شده نادرست است یا منقضی شده است.',
      );

      expect(evalFn).toHaveBeenCalledTimes(2);
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

  describe('verifySchema', () => {
    it.each(['09121234567', ' 0912 123 4567 ', '9121234567', '+989121234567'])(
      'accepts valid phone %s',
      (phone) => {
        const parsed = verifySchema.parse({ phone, otp: '123456' });
        expect(parsed.phone).toBe(phone.trim().replace(/\s+/g, ''));
      },
    );

    it('accepts valid 6-digit OTP', () => {
      const parsed = verifySchema.parse({ phone: '09121234567', otp: '000000' });
      expect(parsed.otp).toBe('000000');
    });

    it.each(['12345', '1234567', 'abcdef', '12345a'])('rejects invalid OTP %s', (otp) => {
      expect(verifySchema.safeParse({ phone: '09121234567', otp }).success).toBe(false);
    });
  });
});
