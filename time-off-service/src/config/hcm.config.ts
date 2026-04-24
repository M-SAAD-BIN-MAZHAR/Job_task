import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * HCM integration configuration class with validation
 * Maps environment variables to type-safe configuration
 */
export class HcmConfig {
  @IsString()
  @IsNotEmpty({ message: 'HCM_BASE_URL is required and must not be empty' })
  HCM_BASE_URL: string;

  @IsString()
  @IsNotEmpty({ message: 'HCM_API_KEY is required and must not be empty' })
  HCM_API_KEY: string;

  @IsString()
  @IsOptional()
  HCM_WEBHOOK_SECRET?: string;

  @IsInt()
  @Min(1000, { message: 'HCM_TIMEOUT_MS must be at least 1000ms' })
  @Max(30000, { message: 'HCM_TIMEOUT_MS must not exceed 30000ms' })
  @Type(() => Number)
  HCM_TIMEOUT_MS: number = 5000;

  @IsInt()
  @Min(0, { message: 'HCM_MAX_RETRIES must be at least 0' })
  @Max(10, { message: 'HCM_MAX_RETRIES must not exceed 10' })
  @Type(() => Number)
  HCM_MAX_RETRIES: number = 3;
}
