import { HttpStatus } from '@nestjs/common';

export class AppException extends Error {
  constructor(
    public readonly code: string,
    public readonly status: HttpStatus,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
