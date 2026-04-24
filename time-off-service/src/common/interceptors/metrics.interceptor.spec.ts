import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from '../metrics/metrics.service';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsInterceptor, MetricsService],
    }).compile();

    interceptor = module.get<MetricsInterceptor>(MetricsInterceptor);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    metricsService.clear();
  });

  const createMockExecutionContext = (
    method: string,
    url: string,
    statusCode: number,
    correlationId?: string,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          correlationId,
        }),
        getResponse: () => ({
          statusCode,
        }),
      }),
    } as ExecutionContext;
  };

  const createMockCallHandler = (shouldError = false): CallHandler => {
    return {
      handle: () => (shouldError ? throwError(() => new Error('Test error')) : of({})),
    } as CallHandler;
  };

  describe('intercept', () => {
    it('should record metrics for successful requests', (done) => {
      const context = createMockExecutionContext('GET', '/api/v1/requests', 200, 'test-123');
      const next = createMockCallHandler();

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              method: 'GET',
              path: '/api/v1/requests',
              statusCode: 200,
              correlationId: 'test-123',
            }),
          );
          done();
        },
      });
    });

    it('should record metrics for failed requests', (done) => {
      const context = createMockExecutionContext('POST', '/api/v1/requests', 500);
      const next = {
        handle: () => throwError(() => ({ status: 500, message: 'Internal error' })),
      } as CallHandler;

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              method: 'POST',
              path: '/api/v1/requests',
              statusCode: 500,
            }),
          );
          done();
        },
      });
    });

    it('should normalize paths with UUIDs', (done) => {
      const context = createMockExecutionContext(
        'GET',
        '/api/v1/requests/550e8400-e29b-41d4-a716-446655440000',
        200,
      );
      const next = createMockCallHandler();

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              path: '/api/v1/requests/:id',
            }),
          );
          done();
        },
      });
    });

    it('should normalize paths with numeric IDs', (done) => {
      const context = createMockExecutionContext('GET', '/api/v1/requests/123', 200);
      const next = createMockCallHandler();

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              path: '/api/v1/requests/:id',
            }),
          );
          done();
        },
      });
    });

    it('should record duration for requests', (done) => {
      const context = createMockExecutionContext('GET', '/api/v1/requests', 200);
      const next = createMockCallHandler();

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              duration: expect.any(Number),
            }),
          );
          const call = recordSpy.mock.calls[0][0];
          expect(call.duration).toBeGreaterThanOrEqual(0);
          done();
        },
      });
    });

    it('should default to 500 status code for errors without status', (done) => {
      const context = createMockExecutionContext('GET', '/api/v1/requests', 200);
      const next = {
        handle: () => throwError(() => new Error('Unknown error')),
      } as CallHandler;

      const recordSpy = jest.spyOn(metricsService, 'recordRequest');

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 500,
            }),
          );
          done();
        },
      });
    });
  });
});
