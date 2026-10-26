import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

import { AppException } from '../exceptions/app-exception.js';

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

@Injectable()
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const details: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
      message: issue.message,
    }));
    throw new AppException(
      'VALIDATION_FAILED',
      HttpStatus.BAD_REQUEST,
      'Request validation failed',
      details,
    );
  }
}
