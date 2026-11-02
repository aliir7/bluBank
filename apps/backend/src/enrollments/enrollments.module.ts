import { Module } from '@nestjs/common';

import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';

@Module({
  imports: [],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [],
})
export class EnrollmentsModule {}
