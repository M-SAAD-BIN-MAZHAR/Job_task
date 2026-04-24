import { Injectable, Logger } from '@nestjs/common';

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  correlationId?: string;
}

export interface HCMMetrics {
  operation: string;
  success: boolean;
  duration: number;
  timestamp: Date;
  errorCode?: string;
}

export interface MetricsSummary {
  requests: {
    total: number;
    successRate: number;
    errorRate: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
  hcm: {
    total: number;
    successRate: number;
    failureRate: number;
    avgLatency: number;
  };
  errors: {
    total: number;
    by4xx: number;
    by5xx: number;
  };
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private requestMetrics: RequestMetrics[] = [];
  private hcmMetrics: HCMMetrics[] = [];
  private readonly maxMetricsSize = 10000; // Keep last 10k metrics

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetrics): void {
    this.requestMetrics.push(metric);
    this.trimMetrics();
  }

  /**
   * Record an HCM operation metric
   */
  recordHCMCall(metric: HCMMetrics): void {
    this.hcmMetrics.push(metric);
    this.trimMetrics();

    // Log HCM failures for monitoring
    if (!metric.success) {
      this.logger.warn({
        message: 'HCM call failed',
        operation: metric.operation,
        duration: metric.duration,
        errorCode: metric.errorCode,
      });
    }
  }

  /**
   * Get metrics summary for monitoring dashboards
   */
  getSummary(): MetricsSummary {
    const recentRequests = this.getRecentMetrics(this.requestMetrics, 5 * 60 * 1000); // Last 5 minutes
    const recentHCM = this.getRecentMetrics(this.hcmMetrics, 5 * 60 * 1000);

    return {
      requests: this.calculateRequestMetrics(recentRequests),
      hcm: this.calculateHCMMetrics(recentHCM),
      errors: this.calculateErrorMetrics(recentRequests),
    };
  }

  /**
   * Get request latency percentiles
   */
  getLatencyPercentiles(): { p50: number; p95: number; p99: number } {
    const latencies = this.requestMetrics.map((m) => m.duration).sort((a, b) => a - b);
    
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    return {
      p50: this.percentile(latencies, 50),
      p95: this.percentile(latencies, 95),
      p99: this.percentile(latencies, 99),
    };
  }

  /**
   * Get HCM call success rate
   */
  getHCMSuccessRate(): number {
    if (this.hcmMetrics.length === 0) return 1.0;
    
    const successful = this.hcmMetrics.filter((m) => m.success).length;
    return successful / this.hcmMetrics.length;
  }

  /**
   * Get error rate by status code range
   */
  getErrorRate(): { total: number; rate4xx: number; rate5xx: number } {
    if (this.requestMetrics.length === 0) {
      return { total: 0, rate4xx: 0, rate5xx: 0 };
    }

    const errors4xx = this.requestMetrics.filter((m) => m.statusCode >= 400 && m.statusCode < 500).length;
    const errors5xx = this.requestMetrics.filter((m) => m.statusCode >= 500).length;
    const total = this.requestMetrics.length;

    return {
      total,
      rate4xx: errors4xx / total,
      rate5xx: errors5xx / total,
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clear(): void {
    this.requestMetrics = [];
    this.hcmMetrics = [];
  }

  private trimMetrics(): void {
    if (this.requestMetrics.length > this.maxMetricsSize) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsSize);
    }
    if (this.hcmMetrics.length > this.maxMetricsSize) {
      this.hcmMetrics = this.hcmMetrics.slice(-this.maxMetricsSize);
    }
  }

  private getRecentMetrics<T extends { timestamp: Date }>(metrics: T[], windowMs: number): T[] {
    const cutoff = new Date(Date.now() - windowMs);
    return metrics.filter((m) => m.timestamp >= cutoff);
  }

  private calculateRequestMetrics(metrics: RequestMetrics[]) {
    if (metrics.length === 0) {
      return {
        total: 0,
        successRate: 1.0,
        errorRate: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
      };
    }

    const successful = metrics.filter((m) => m.statusCode < 400).length;
    const latencies = metrics.map((m) => m.duration).sort((a, b) => a - b);

    return {
      total: metrics.length,
      successRate: successful / metrics.length,
      errorRate: (metrics.length - successful) / metrics.length,
      avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      p95Latency: this.percentile(latencies, 95),
      p99Latency: this.percentile(latencies, 99),
    };
  }

  private calculateHCMMetrics(metrics: HCMMetrics[]) {
    if (metrics.length === 0) {
      return {
        total: 0,
        successRate: 1.0,
        failureRate: 0,
        avgLatency: 0,
      };
    }

    const successful = metrics.filter((m) => m.success).length;
    const avgLatency = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;

    return {
      total: metrics.length,
      successRate: successful / metrics.length,
      failureRate: (metrics.length - successful) / metrics.length,
      avgLatency,
    };
  }

  private calculateErrorMetrics(metrics: RequestMetrics[]) {
    const errors4xx = metrics.filter((m) => m.statusCode >= 400 && m.statusCode < 500).length;
    const errors5xx = metrics.filter((m) => m.statusCode >= 500).length;

    return {
      total: errors4xx + errors5xx,
      by4xx: errors4xx,
      by5xx: errors5xx,
    };
  }

  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }
}
