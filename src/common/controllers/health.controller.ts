import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health check response interface
 */
interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    database?: { status: string };
    redis?: { status: string };
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Health check endpoint
   *
   * Returns the health status of the application including:
   * - Application uptime
   * - Environment information
   * - Database connection status
   * - Redis connection status (if available)
   *
   * @returns Health check response with system status
   *
   * @example
   * GET /health
   * Response:
   * {
   *   "status": "ok",
   *   "timestamp": "2024-01-15T10:30:00.000Z",
   *   "uptime": 3600.5,
   *   "environment": "production",
   *   "version": "1.0.0",
   *   "checks": {
   *     "database": { "status": "connected" }
   *   }
   * }
   */
  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns the health status of the application and its dependencies',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
        uptime: { type: 'number', example: 3600.5 },
        environment: { type: 'string', example: 'production' },
        version: { type: 'string', example: '1.0.0' },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'connected' },
              },
            },
          },
        },
      },
    },
  })
  async health(): Promise<HealthResponse> {
    const healthResponse: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV') || 'development',
      version: this.configService.get('APP_VERSION') || '1.0.0',
      checks: {},
    };

    // Check database connection
    try {
      await this.dataSource.query('SELECT 1');
      healthResponse.checks.database = { status: 'connected' };
    } catch (error) {
      healthResponse.status = 'error';
      healthResponse.checks.database = { status: 'disconnected' };
    }

    return healthResponse;
  }
}
