import { randomInt } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../common/exceptions/app-exception.js';
import { RedisService } from '../redis/redis.service.js';
import { ChallengeInput } from './dto/challenge.dto.js';
import type { VerifyInput } from './dto/verify.dto.js';

// Six-digit codes without a leading zero: 100000 to 999999. randomInt's max is exclusive.
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;
const OTP_TTL_SECONDS = 120;

// Atomic compare-and-delete: deletes the key only if the value matches.
// Returns 1 if deleted (match), 0 if not deleted (mismatch or missing).
const CONSUME_OTP_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

// One pending challenge per phone number. REDIS_KEY_PREFIX is added by ioredis.
function challengeKey(phone: string): string {
  return `enrollment:otp:${phone}`;
}

export interface ChallengeResult {
  phone: string;
  expiresIn: number;
}

export interface VerifyResult {
  verified: true;
}

@Injectable()
export class EnrollmentsService {
  constructor(private readonly redis: RedisService) {}

  // Stores the code as a plain Redis string, not JSON. A new challenge for the same number
  // replaces the previous code and restarts its TTL.
  async createChallenge(input: ChallengeInput): Promise<ChallengeResult> {
    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    await this.redis.setString(challengeKey(input.phone), code, OTP_TTL_SECONDS);

    return {
      phone: input.phone,
      expiresIn: OTP_TTL_SECONDS,
    };
  }

  // A missing, expired or wrong code gets the same error, so a client cannot tell whether a
  // challenge exists for the number.
  async verifyChallenge(input: VerifyInput): Promise<VerifyResult> {
    const deleted = await this.redis.eval(
      CONSUME_OTP_SCRIPT,
      1,
      challengeKey(input.phone),
      input.otp,
    );

    if (deleted !== 1) {
      throw new AppException(
        'OTP_INVALID',
        HttpStatus.BAD_REQUEST,
        'کد وارد شده نادرست است یا منقضی شده است.',
      );
    }

    return { verified: true };
  }
}
