import { plainToClass } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { AppConfig } from './app.config';
import { DatabaseConfig } from './database.config';
import { JwtConfig } from './jwt.config';
import { HcmConfig } from './hcm.config';

/**
 * Combined configuration class that aggregates all configuration sections
 */
class EnvironmentVariables {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  hcm: HcmConfig;
}

/**
 * Validates environment variables at application startup
 * Throws an error with detailed messages if validation fails
 * 
 * @param config - Raw environment variables from process.env
 * @returns Validated and type-converted configuration object
 * @throws Error if required configuration is missing or invalid
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  // Transform and validate each configuration section
  const appConfig = plainToClass(AppConfig, config, {
    enableImplicitConversion: true,
  });
  const databaseConfig = plainToClass(DatabaseConfig, config, {
    enableImplicitConversion: true,
  });
  const jwtConfig = plainToClass(JwtConfig, config, {
    enableImplicitConversion: true,
  });
  const hcmConfig = plainToClass(HcmConfig, config, {
    enableImplicitConversion: true,
  });

  // Validate each configuration section
  const appErrors = validateSync(appConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  const databaseErrors = validateSync(databaseConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  const jwtErrors = validateSync(jwtConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  const hcmErrors = validateSync(hcmConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  // Combine all validation errors
  const allErrors = [
    ...appErrors,
    ...databaseErrors,
    ...jwtErrors,
    ...hcmErrors,
  ];

  if (allErrors.length > 0) {
    const errorMessages = formatValidationErrors(allErrors);
    throw new Error(
      `Configuration validation failed:\n${errorMessages}\n\n` +
      `Please check your .env file or environment variables.`
    );
  }

  return {
    app: appConfig,
    database: databaseConfig,
    jwt: jwtConfig,
    hcm: hcmConfig,
  };
}

/**
 * Formats validation errors into human-readable messages
 * 
 * @param errors - Array of validation errors from class-validator
 * @returns Formatted error message string
 */
function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints).join(', ')
        : 'Invalid value';
      return `  - ${error.property}: ${constraints}`;
    })
    .join('\n');
}
