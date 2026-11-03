import { randomInt, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';
import { ChallengeInput } from './dto/challenge.dto.js';

export interface ChallengeResult {
  phone: string;
  expiresIn: number;
}

@Injectable()
export class EnrollmentsService {
  private static readonly OTP_TTL_SECONDS = 120;
  private static readonly OTP_MIN = 100_000;
  private static readonly OTP_MAX = 1_000_000;

  constructor(private readonly redis: RedisService) {}

  async createChallenge(input: ChallengeInput): Promise<ChallengeResult> {
    const code = randomInt(EnrollmentsService.OTP_MIN, EnrollmentsService.OTP_MAX).toString();
    const key = `otp:${randomUUID()}`;

    await this.redis.setString(key, code, EnrollmentsService.OTP_TTL_SECONDS);

    return {
      phone: input.phone,
      expiresIn: EnrollmentsService.OTP_TTL_SECONDS,
    };
  }
}
