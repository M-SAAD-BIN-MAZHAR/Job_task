import { IsString, IsOptional } from 'class-validator';

/**
 * Database configuration class with validation
 * Maps environment variables to type-safe configuration
 */
export class DatabaseConfig {
  @IsString()
  @IsOptional()
  DATABASE_PATH: string = './data/timeoff.db';
}
