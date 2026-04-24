# Configuration Module

This module provides type-safe, validated configuration management for the Time-Off Microservice.

## Overview

The configuration system uses:
- **@nestjs/config**: NestJS configuration module for environment variable management
- **class-validator**: Declarative validation using decorators
- **class-transformer**: Type conversion from string environment variables to typed values

## Configuration Classes

### AppConfig
Application-level configuration including server port, environment, and logging.

**Environment Variables:**
- `PORT` (optional, default: 3000): HTTP server port (1-65535)
- `NODE_ENV` (optional, default: development): Application environment (development, production, test)
- `LOG_LEVEL` (optional, default: info): Logging level (error, warn, info, debug, verbose)
- `BALANCE_STALE_THRESHOLD_MS` (optional, default: 300000): Staleness threshold for cached balances
- `OUTBOX_POLL_INTERVAL_MS` (optional, default: 5000): Outbox polling interval

### DatabaseConfig
Database connection configuration for SQLite.

**Environment Variables:**
- `DATABASE_PATH` (optional, default: ./data/timeoff.db): Path to SQLite database file

### JwtConfig
JWT authentication configuration.

**Environment Variables:**
- `JWT_SECRET` (**required**): Secret key for signing JWT tokens
- `JWT_EXPIRATION` (optional, default: 24h): Token expiration time

### HcmConfig
HCM system integration configuration.

**Environment Variables:**
- `HCM_BASE_URL` (**required**): Base URL for HCM system API
- `HCM_API_KEY` (**required**): API key for HCM authentication
- `HCM_WEBHOOK_SECRET` (optional): Secret for webhook signature validation
- `HCM_TIMEOUT_MS` (optional, default: 5000): Request timeout in milliseconds (1000-30000)
- `HCM_MAX_RETRIES` (optional, default: 3): Maximum retry attempts (0-10)

## Validation

Configuration validation occurs at application startup via the `validateEnvironment` function. If validation fails, the application will not start and will display detailed error messages.

### Validation Rules

1. **Required Fields**: Must be present and non-empty
2. **Type Conversion**: String environment variables are converted to appropriate types (number, boolean)
3. **Range Validation**: Numeric values are validated against min/max constraints
4. **Enum Validation**: String values are validated against allowed options

### Example Error Messages

```
Configuration validation failed:
  - JWT_SECRET: JWT_SECRET is required and must not be empty
  - PORT: PORT must not exceed 65535
  - NODE_ENV: NODE_ENV must be one of: development, production, test

Please check your .env file or environment variables.
```

## Usage

### In Application Bootstrap

The validation is automatically applied in `app.module.ts`:

```typescript
import { validateEnvironment } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

### Accessing Configuration in Services

Use NestJS's `ConfigService` to access validated configuration:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {}

  someMethod() {
    const port = this.configService.get<number>('PORT');
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const hcmBaseUrl = this.configService.get<string>('HCM_BASE_URL');
  }
}
```

## Setup Instructions

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Update required variables:**
   - Set a strong `JWT_SECRET` (generate with: `openssl rand -base64 32`)
   - Configure `HCM_BASE_URL` and `HCM_API_KEY` for your HCM system

3. **Start the application:**
   ```bash
   npm run start:dev
   ```

4. **Verify configuration:**
   - If validation fails, check the error messages
   - Ensure all required variables are set
   - Verify values are within valid ranges

## Production Deployment

For production environments:

1. **Generate a strong JWT secret:**
   ```bash
   openssl rand -base64 32
   ```

2. **Set production environment:**
   ```
   NODE_ENV=production
   LOG_LEVEL=warn
   ```

3. **Configure HCM integration:**
   - Use production HCM system URL
   - Use production API credentials
   - Set appropriate timeout and retry values

4. **Secure sensitive values:**
   - Never commit `.env` files to version control
   - Use secret management systems (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Rotate credentials regularly

## Testing

Configuration validation is tested in `config.spec.ts`. Tests verify:
- Required fields are enforced
- Type conversion works correctly
- Range validation is applied
- Invalid values are rejected with clear error messages

## Troubleshooting

### Application won't start

**Error:** "JWT_SECRET is required and must not be empty"
- **Solution:** Set `JWT_SECRET` in your `.env` file

**Error:** "PORT must not exceed 65535"
- **Solution:** Set `PORT` to a value between 1 and 65535

**Error:** "NODE_ENV must be one of: development, production, test"
- **Solution:** Set `NODE_ENV` to a valid value

### Configuration not loading

1. Verify `.env` file exists in the project root
2. Check file permissions (must be readable)
3. Ensure no syntax errors in `.env` file (no quotes around values unless needed)
4. Restart the application after changing `.env`

## References

- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [class-transformer Documentation](https://github.com/typestack/class-transformer)
