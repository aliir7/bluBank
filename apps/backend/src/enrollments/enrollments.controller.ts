import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { SendOtpInput } from './dto/send-otp.dto.js';
import { sendOtpSchema } from './dto/send-otp.dto.js';
import type { SendOtpResult } from './enrollments.service.js';
import { EnrollmentsService } from './enrollments.service.js';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body(new ZodValidationPipe(sendOtpSchema)) body: SendOtpInput): SendOtpResult {
    return this.enrollmentsService.sendOtp(body);
  }
}
