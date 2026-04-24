import { Controller, Get, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Inject } from '@nestjs/common';
import { HCM_CLIENT, IHCMClient } from '../hcm/hcm-client.interface';
import { Public } from '../auth/public.decorator';
import { MetricsService } from '../common/metrics/metrics.service';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  database: {
    status: 'up' | 'down';
    latencyMs: number;
  };
  hcm: {
    status: 'up' | 'down';
    latencyMs: number;
  };
  timestamp: string;
}

interface LivenessStatus {
  status: 'ok';
  timestamp: string;
}

interface ReadinessStatus {
  status: 'ok' | 'degraded' | 'down';
  database: {
    status: 'up' | 'down';
    latencyMs: number;
  };
  hcm: {
    status: 'up' | 'down';
    latencyMs: number;
  };
  timestamp: string;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * GET /api/v1/health
   * Overall service health status
   * Returns 200 if service is operational, 503 if degraded or down
   */
  @Get()
  @Public()
  async getHealth(): Promise<HealthStatus> {
    this.logger.log('GET /health - Checking overall service health');

    const dbCheck = await this.checkDatabase();
    const hcmCheck = await this.checkHCM();

    let overallStatus: 'ok' | 'degraded' | 'down';
    if (dbCheck.status === 'up' && hcmCheck.status === 'up') {
      overallStatus = 'ok';
    } else if (dbCheck.status === 'up') {
      // Database is up but HCM is down - degraded mode
      overallStatus = 'degraded';
    } else {
      // Database is down - service is down
      overallStatus = 'down';
    }

    return {
      status: overallStatus,
      database: dbCheck,
      hcm: hcmCheck,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/health/live
   * Liveness probe - indicates the application is running
   * Always returns 200 if the process is alive
   */
  @Get('live')
  @Public()
  async getLiveness(): Promise<LivenessStatus> {
    this.logger.log('GET /health/live - Liveness check');
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/health/ready
   * Readiness probe - indicates the service can accept traffic
   * Returns 200 if both database and HCM are available, 503 otherwise
   */
  @Get('ready')
  @Public()
  async getReadiness(): Promise<ReadinessStatus> {
    this.logger.log('GET /health/ready - Readiness check');

    const dbCheck = await this.checkDatabase();
    const hcmCheck = await this.checkHCM();

    let readinessStatus: 'ok' | 'degraded' | 'down';
    if (dbCheck.status === 'up' && hcmCheck.status === 'up') {
      readinessStatus = 'ok';
    } else if (dbCheck.status === 'up') {
      // Database is up but HCM is down - degraded mode
      readinessStatus = 'degraded';
    } else {
      // Database is down - not ready
      readinessStatus = 'down';
    }

    return {
      status: readinessStatus,
      database: dbCheck,
      hcm: hcmCheck,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/health/metrics
   * Expose metrics for monitoring dashboards
   * Returns request latency, error rates, and HCM call success rates
   */
  @Get('metrics')
  @Public()
  async getMetrics() {
    this.logger.log('GET /health/metrics - Fetching metrics');
    
    const summary = this.metricsService.getSummary();
    const latencyPercentiles = this.metricsService.getLatencyPercentiles();
    const hcmSuccessRate = this.metricsService.getHCMSuccessRate();
    const errorRate = this.metricsService.getErrorRate();

    return {
      timestamp: new Date().toISOString(),
      requests: {
        ...summary.requests,
        latencyPercentiles,
      },
      hcm: {
        ...summary.hcm,
        successRate: hcmSuccessRate,
      },
      errors: {
        ...summary.errors,
        ...errorRate,
      },
    };
  }

  /**
   * Check database connectivity by executing a simple query
   */
  private async checkDatabase(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const startTime = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      const latencyMs = Date.now() - startTime;
      this.logger.debug(`Database check passed (${latencyMs}ms)`);
      return { status: 'up', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.error(`Database check failed: ${error.message}`);
      return { status: 'down', latencyMs };
    }
  }

  /**
   * Check HCM system availability using the healthCheck method
   */
  private async checkHCM(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.hcmClient.healthCheck();
      const latencyMs = Date.now() - startTime;
      if (isHealthy) {
        this.logger.debug(`HCM check passed (${latencyMs}ms)`);
        return { status: 'up', latencyMs };
      } else {
        this.logger.warn(`HCM check failed - unhealthy response (${latencyMs}ms)`);
        return { status: 'down', latencyMs };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.error(`HCM check failed: ${error.message}`);
      return { status: 'down', latencyMs };
    }
  }
}
