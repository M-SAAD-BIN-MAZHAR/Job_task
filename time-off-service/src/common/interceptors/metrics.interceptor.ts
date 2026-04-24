import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, correlationId } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const duration = Date.now() - startTime;

          this.metricsService.recordRequest({
            method,
            path: this.normalizePath(url),
            statusCode: response.statusCode,
            duration,
            timestamp: new Date(),
            correlationId,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.metricsService.recordRequest({
            method,
            path: this.normalizePath(url),
            statusCode,
            duration,
            timestamp: new Date(),
            correlationId,
          });
        },
      }),
    );
  }

  /**
   * Normalize path to remove IDs for better metric aggregation
   * e.g., /api/v1/requests/123 -> /api/v1/requests/:id
   */
  private normalizePath(url: string): string {
    return url
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }
}
