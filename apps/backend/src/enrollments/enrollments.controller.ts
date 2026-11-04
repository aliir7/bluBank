import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiFailure, ApiSuccess } from '../common/decorators/api-decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { ChallengeInput } from './dto/challenge.dto.js';
import { challengeSchema } from './dto/challenge.dto.js';
import type { VerifyInput } from './dto/verify.dto.js';
import { verifySchema } from './dto/verify.dto.js';
import type { ChallengeResult, VerifyResult } from './enrollments.service.js';
import { EnrollmentsService } from './enrollments.service.js';

// Zod schema for the challenge result payload (before envelope wrapping)
const challengeResultSchema = z.object({
  phone: z.string(),
  expiresIn: z.number().int().positive(),
});

// Convert Zod schema to OpenAPI SchemaObject for @ApiBody
const challengeBodySchema = challengeSchema.toJSONSchema() as SchemaObject;

// Zod schema for the verify result payload
const verifyResultSchema = z.object({
  verified: z.literal(true),
});

// Convert verify schema to OpenAPI SchemaObject for @ApiBody
const verifyBodySchema = verifySchema.toJSONSchema() as SchemaObject;

@ApiTags('Enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create enrollment challenge (OTP)',
    description:
      'Generates a one-time password (OTP) for the given Iranian mobile phone number and stores it in Redis with a TTL.',
  })
  @ApiBody({
    description: 'Challenge request with Iranian mobile phone number',
    schema: challengeBodySchema,
  })
  @ApiSuccess(HttpStatus.OK, challengeResultSchema)
  @ApiFailure(HttpStatus.BAD_REQUEST)
  async challenge(
    @Body(new ZodValidationPipe(challengeSchema)) body: ChallengeInput,
  ): Promise<ChallengeResult> {
    return this.enrollmentsService.createChallenge(body);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify enrollment challenge (OTP)',
    description:
      'Verifies the OTP for the given phone number. The OTP is single-use and is deleted on successful verification. A missing, expired, or wrong code all return the same error.',
  })
  @ApiBody({
    description: 'Verify request with phone and OTP',
    schema: verifyBodySchema,
  })
  @ApiSuccess(HttpStatus.OK, verifyResultSchema)
  @ApiFailure(HttpStatus.BAD_REQUEST)
  async verify(
    @Body(new ZodValidationPipe(verifySchema)) body: VerifyInput,
  ): Promise<VerifyResult> {
    return this.enrollmentsService.verifyChallenge(body);
  }
}
