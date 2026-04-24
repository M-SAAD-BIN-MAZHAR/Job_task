import { IsString, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Application configuration class with validation
 * Maps environment variables to type-safe configuration
 */
export class AppConfig {
  @IsInt()
  @Min(1, { message: 'PORT must be at least 1' })
  @Max(65535, { message: 'PORT must not exceed 65535' })
  @Type(() => Number)
  PORT: number = 3000;

  @IsEnum(['development', 'production', 'test'], {
    message: 'NODE_ENV must be one of: development, production, test',
  })
  NODE_ENV: string = 'development';

  @IsEnum(['error', 'warn', 'info', 'debug', 'verbose'], {
    message: 'LOG_LEVEL must be one of: error, warn, info, debug, verbose',
  })
  LOG_LEVEL: string = 'info';

  @IsInt()
  @Min(1000, { message: 'BALANCE_STALE_THRESHOLD_MS must be at least 1000ms' })
  @Type(() => Number)
  BALANCE_STALE_THRESHOLD_MS: number = 300000; // 5 minutes

  @IsInt()
  @Min(1000, { message: 'OUTBOX_POLL_INTERVAL_MS must be at least 1000ms' })
  @Type(() => Number)
  OUTBOX_POLL_INTERVAL_MS: number = 5000;
}
