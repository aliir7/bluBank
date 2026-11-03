import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { ChallengeInput } from './dto/challenge.dto.js';
import { challengeSchema } from './dto/challenge.dto.js';
import type { ChallengeResult } from './enrollments.service.js';
import { EnrollmentsService } from './enrollments.service.js';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  async challenge(
    @Body(new ZodValidationPipe(challengeSchema)) body: ChallengeInput,
  ): Promise<ChallengeResult> {
    return this.enrollmentsService.createChallenge(body);
  }
}
