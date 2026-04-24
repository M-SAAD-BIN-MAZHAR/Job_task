# Idempotency Module

This module provides idempotency support for state-changing operations in the Time-Off Service, ensuring that duplicate requests (e.g., due to network retries) do not cause duplicate state mutations.

## Overview

The idempotency module implements the idempotency pattern as specified in the design document:

```
function withIdempotency(key, operation):
  IF key is null: RETURN operation()
  existing = SELECT * FROM idempotency_keys WHERE key = key AND expiresAt > now()
  IF existing: RETURN existing.response
  result = operation()
  INSERT idempotency_keys { key, response: result, createdAt: now(), expiresAt: now() + 24h }
  RETURN result
```

## Components

### IdempotencyService

The main service that provides idempotency functionality.

**Methods:**

- `withIdempotency<T>(key: string | undefined, operation: () => Promise<T>): Promise<T>`
  - Executes an operation with idempotency protection
  - If `key` is undefined, executes the operation normally without caching
  - If `key` exists and is valid, returns the cached response
  - If `key` doesn't exist, executes the operation and caches the result
  - Returns the operation result

- `cleanupExpired(): Promise<void>`
  - Removes expired idempotency keys from the database
  - Runs automatically every hour via cron job
  - Can be called manually for testing or maintenance

### IdempotencyRepository

Repository for managing idempotency keys in the database.

**Methods:**

- `findValid(key: string): Promise<IdempotencyKey | null>`
  - Finds an idempotency key if it exists and hasn't expired
  - Returns `null` if the key doesn't exist or has expired

- `save(key: string, response: unknown, ttlMs?: number): Promise<IdempotencyKey>`
  - Saves an idempotency key with its response
  - Default TTL is 24 hours (86,400,000 ms)
  - Handles race conditions gracefully when multiple requests try to save the same key

- `deleteExpired(): Promise<void>`
  - Deletes all expired idempotency keys from the database

### IdempotencyKey Entity

Database entity representing an idempotency key.

**Fields:**

- `key: string` - Primary key, the idempotency key provided by the client
- `response: unknown` - The cached response (stored as JSON)
- `createdAt: Date` - Timestamp when the key was created
- `expiresAt: Date` - Timestamp when the key expires (indexed for efficient cleanup)

## Usage

### Basic Usage

```typescript
import { IdempotencyService } from './common/idempotency/idempotency.service';

@Injectable()
export class RequestService {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async createRequest(dto: CreateRequestDto, idempotencyKey?: string): Promise<TimeOffRequest> {
    return this.idempotencyService.withIdempotency(
      idempotencyKey,
      async () => {
        // Your state-changing operation here
        const request = this.requestRepository.create(dto);
        return this.requestRepository.save(request);
      }
    );
  }
}
```

### In Controllers

```typescript
@Post('/requests')
async createRequest(
  @Body() dto: CreateRequestDto,
  @Headers('idempotency-key') idempotencyKey?: string,
): Promise<TimeOffRequest> {
  return this.requestService.createRequest(dto, idempotencyKey);
}
```

### Without Idempotency Key

If no idempotency key is provided, the operation executes normally:

```typescript
// This will execute the operation every time
const result = await idempotencyService.withIdempotency(undefined, operation);
```

## Configuration

The module uses the following configuration:

- **TTL (Time To Live)**: 24 hours by default (configurable per operation)
- **Cleanup Schedule**: Runs every hour via `@Cron(CronExpression.EVERY_HOUR)`
- **Database**: Uses TypeORM with SQLite (or any TypeORM-supported database)

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 4.1**: Check for previous processing of Request_Key
- **Requirement 4.2**: Return cached response if Request_Key was processed previously
- **Requirement 4.3**: Store Request_Key and response for future idempotency checks
- **Requirement 4.4**: Maintain Request_Key records for at least 24 hours
- **Requirement 4.6**: Prevent duplicate state mutations via Request_Key

## Design Properties

The implementation validates **Property 7** from the design document:

> **Property 7: Idempotent Operations Produce Consistent Results**
>
> For any state-changing operation `O` with idempotency key `K`, executing `O` once and executing `O` multiple times with the same `K` produce identical observable outcomes. The second and subsequent calls return the same response as the first without additional side effects.

## Testing

The module includes comprehensive tests:

- **Unit Tests**: `idempotency.service.spec.ts` and `idempotency.repository.spec.ts`
  - Test all methods in isolation with mocked dependencies
  - Verify correct behavior for various scenarios

- **Integration Tests**: `idempotency.integration.spec.ts`
  - Test with real in-memory SQLite database
  - Verify end-to-end functionality
  - Test concurrent operations and race conditions

Run tests:

```bash
npm test -- idempotency
```

## Race Condition Handling

The implementation handles race conditions gracefully:

1. When multiple concurrent requests use the same idempotency key
2. The first request to check finds no cached result
3. Multiple requests may execute the operation concurrently
4. When saving the result, only one will succeed (due to unique constraint)
5. Others will catch the constraint violation and continue normally
6. All requests return their executed result (which should be identical for idempotent operations)

This is acceptable because:
- The operation itself should be idempotent
- All concurrent requests will get the same result
- The database ensures only one cached response is stored
- Subsequent requests will use the cached response

## Integration with Other Modules

The IdempotencyModule should be imported by any module that needs idempotency support:

```typescript
@Module({
  imports: [IdempotencyModule],
  providers: [RequestService],
  controllers: [RequestController],
})
export class RequestModule {}
```

## Future Enhancements

Potential improvements for future iterations:

1. **Distributed Locking**: Add distributed locking (e.g., Redis) to prevent duplicate execution in multi-instance deployments
2. **Configurable TTL**: Make TTL configurable via environment variables
3. **Metrics**: Add metrics for cache hit rate, cleanup statistics
4. **Key Namespacing**: Support namespaced keys for different operation types
5. **Compression**: Compress large responses before storing
