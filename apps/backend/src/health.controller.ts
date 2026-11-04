import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiSuccess } from './common/decorators/api-decorators.js';

// Zod schema for the health check response payload (before envelope wrapping)
const healthDataSchema = z.object({
  status: z.literal('ok'),
});

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @Version(VERSION_NEUTRAL)
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns the service health status. Excluded from the /api prefix and versioning.',
  })
  @ApiSuccess(200, healthDataSchema)
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
