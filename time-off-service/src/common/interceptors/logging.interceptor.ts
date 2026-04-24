import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly logLevel: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, correlationId, user } = request;
    const startTime = Date.now();

    // Log incoming request (debug level)
    if (this.shouldLog('debug')) {
      this.logger.debug(
        this.formatLog({
          event: 'request.incoming',
          method,
          url,
          correlationId,
          userId: user?.sub,
          userRole: user?.role,
          body: this.sanitizeBody(body),
        }),
      );
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          const duration = Date.now() - startTime;

          // Log successful request completion
          this.logger.log(
            this.formatLog({
              event: 'request.completed',
              method,
              url,
              statusCode: response.statusCode,
              duration,
              correlationId,
              userId: user?.sub,
              userRole: user?.role,
            }),
          );

          // Log slow requests as warnings
          if (duration > 1000) {
            this.logger.warn(
              this.formatLog({
                event: 'request.slow',
                method,
                url,
                statusCode: response.statusCode,
                duration,
                correlationId,
                threshold: 1000,
              }),
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          // Log error with stack trace
          this.logger.error(
            this.formatLog({
              event: 'request.failed',
              method,
              url,
              statusCode,
              duration,
              correlationId,
              userId: user?.sub,
              error: {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: this.isProduction ? undefined : error.stack,
              },
            }),
          );
        },
      }),
    );
  }

  /**
   * Format log entry as JSON for structured logging
   */
  private formatLog(data: Record<string, any>): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'time-off-service',
      ...data,
    };

    // In production, output as JSON for log aggregation tools
    if (this.isProduction) {
      return JSON.stringify(logEntry);
    }

    // In development, output as readable format
    return JSON.stringify(logEntry, null, 2);
  }

  /**
   * Sanitize request body to remove sensitive data
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Check if current log level should be logged
   */
  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'log', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);

    return requestedLevelIndex <= currentLevelIndex;
  }
}
