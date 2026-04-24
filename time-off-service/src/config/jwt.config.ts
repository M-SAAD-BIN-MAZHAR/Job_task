import { IsString, IsNotEmpty } from 'class-validator';

/**
 * JWT authentication configuration class with validation
 * Maps environment variables to type-safe configuration
 */
export class JwtConfig {
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET is required and must not be empty' })
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRATION: string = '24h';
}
