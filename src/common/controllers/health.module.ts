import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health check module
 *
 * Provides health check endpoints for monitoring application status
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
