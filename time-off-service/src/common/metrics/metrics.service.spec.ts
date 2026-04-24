import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    service.clear();
  });

  describe('recordRequest', () => {
    it('should record a request metric', () => {
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/requests',
        statusCode: 200,
        duration: 50,
        timestamp: new Date(),
        correlationId: 'test-123',
      });

      const summary = service.getSummary();
      expect(summary.requests.total).toBeGreaterThan(0);
    });

    it('should track successful requests', () => {
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/requests',
        statusCode: 200,
        duration: 50,
        timestamp: new Date(),
      });

      const summary = service.getSummary();
      expect(summary.requests.successRate).toBe(1.0);
      expect(summary.requests.errorRate).toBe(0);
    });

    it('should track error requests', () => {
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/requests',
        statusCode: 500,
        duration: 50,
        timestamp: new Date(),
      });

      const summary = service.getSummary();
      expect(summary.requests.successRate).toBe(0);
      expect(summary.requests.errorRate).toBe(1.0);
    });
  });

  describe('recordHCMCall', () => {
    it('should record a successful HCM call', () => {
      service.recordHCMCall({
        operation: 'fetchBalance',
        success: true,
        duration: 100,
        timestamp: new Date(),
      });

      const summary = service.getSummary();
      expect(summary.hcm.total).toBeGreaterThan(0);
      expect(summary.hcm.successRate).toBe(1.0);
    });

    it('should record a failed HCM call', () => {
      service.recordHCMCall({
        operation: 'fetchBalance',
        success: false,
        duration: 100,
        timestamp: new Date(),
        errorCode: 'TIMEOUT',
      });

      const summary = service.getSummary();
      expect(summary.hcm.failureRate).toBe(1.0);
    });
  });

  describe('getLatencyPercentiles', () => {
    it('should calculate latency percentiles correctly', () => {
      // Record requests with known latencies
      for (let i = 1; i <= 100; i++) {
        service.recordRequest({
          method: 'GET',
          path: '/api/v1/test',
          statusCode: 200,
          duration: i,
          timestamp: new Date(),
        });
      }

      const percentiles = service.getLatencyPercentiles();
      expect(percentiles.p50).toBeGreaterThan(0);
      expect(percentiles.p95).toBeGreaterThan(percentiles.p50);
      expect(percentiles.p99).toBeGreaterThan(percentiles.p95);
    });

    it('should return zeros when no metrics exist', () => {
      const percentiles = service.getLatencyPercentiles();
      expect(percentiles.p50).toBe(0);
      expect(percentiles.p95).toBe(0);
      expect(percentiles.p99).toBe(0);
    });
  });

  describe('getHCMSuccessRate', () => {
    it('should return 1.0 when no HCM calls recorded', () => {
      const rate = service.getHCMSuccessRate();
      expect(rate).toBe(1.0);
    });

    it('should calculate success rate correctly', () => {
      service.recordHCMCall({
        operation: 'fetchBalance',
        success: true,
        duration: 100,
        timestamp: new Date(),
      });
      service.recordHCMCall({
        operation: 'fetchBalance',
        success: false,
        duration: 100,
        timestamp: new Date(),
      });

      const rate = service.getHCMSuccessRate();
      expect(rate).toBe(0.5);
    });
  });

  describe('getErrorRate', () => {
    it('should calculate 4xx and 5xx error rates', () => {
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/test',
        statusCode: 200,
        duration: 50,
        timestamp: new Date(),
      });
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/test',
        statusCode: 400,
        duration: 50,
        timestamp: new Date(),
      });
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/test',
        statusCode: 500,
        duration: 50,
        timestamp: new Date(),
      });

      const errorRate = service.getErrorRate();
      expect(errorRate.total).toBe(3);
      expect(errorRate.rate4xx).toBeCloseTo(1 / 3);
      expect(errorRate.rate5xx).toBeCloseTo(1 / 3);
    });
  });

  describe('getSummary', () => {
    it('should return comprehensive metrics summary', () => {
      // Record some requests
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/requests',
        statusCode: 200,
        duration: 50,
        timestamp: new Date(),
      });
      service.recordRequest({
        method: 'POST',
        path: '/api/v1/requests',
        statusCode: 201,
        duration: 100,
        timestamp: new Date(),
      });

      // Record some HCM calls
      service.recordHCMCall({
        operation: 'fetchBalance',
        success: true,
        duration: 150,
        timestamp: new Date(),
      });

      const summary = service.getSummary();
      expect(summary.requests).toBeDefined();
      expect(summary.hcm).toBeDefined();
      expect(summary.errors).toBeDefined();
      expect(summary.requests.total).toBeGreaterThan(0);
      expect(summary.requests.avgLatency).toBeGreaterThan(0);
    });

    it('should handle empty metrics gracefully', () => {
      const summary = service.getSummary();
      expect(summary.requests.total).toBe(0);
      expect(summary.requests.successRate).toBe(1.0);
      expect(summary.hcm.total).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      service.recordRequest({
        method: 'GET',
        path: '/api/v1/test',
        statusCode: 200,
        duration: 50,
        timestamp: new Date(),
      });

      service.clear();

      const summary = service.getSummary();
      expect(summary.requests.total).toBe(0);
      expect(summary.hcm.total).toBe(0);
    });
  });
});
