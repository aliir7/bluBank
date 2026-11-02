import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SendOtpInput } from './dto/send-otp.dto.js';

export interface SendOtpResult {
  phone: string;
  code: string;
  expiresIn: number;
}

@Injectable()
export class EnrollmentsService {
  private static readonly OTP_TTL_SECONDS = 120;
  private static readonly OTP_MIN = 100_000;
  private static readonly OTP_MAX = 1_000_000;

  sendOtp(input: SendOtpInput): SendOtpResult {
    const code = randomInt(EnrollmentsService.OTP_MIN, EnrollmentsService.OTP_MAX).toString();

    return {
      phone: input.phone,
      code,
      expiresIn: EnrollmentsService.OTP_TTL_SECONDS,
    };
  }
}
