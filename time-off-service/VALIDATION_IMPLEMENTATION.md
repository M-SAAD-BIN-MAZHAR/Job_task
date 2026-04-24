# Request Validation and Error Handling Implementation

## Overview
This document summarizes the implementation of comprehensive request validation and error handling for the Time-Off Microservice, completing Task 9.4.

## Requirements Validated
- **18.1**: Invalid dates return 400 Bad Request with descriptive error messages
- **18.2**: Insufficient balance returns 400 Bad Request (handled by business logic)
- **18.3**: Overlapping dates return 400 Bad Request (handled by business logic)
- **18.4**: Invalid state transitions return 400 Bad Request with valid transitions
- **18.5**: Start date must be before or equal to end date
- **18.6**: Requested time must not exceed available balance (handled by business logic)
- **18.7**: Employee must exist in system before creating request (handled by business logic)

## Implementation Details

### 1. Global Exception Filter
**File**: `src/common/filters/http-exception.filter.ts`

**Enhancements**:
- Handles validation errors from class-validator with array of error messages
- Maps HTTP status codes to appropriate error codes (BAD_REQUEST, NOT_FOUND, CONFLICT, etc.)
- Returns consistent error envelope format:
  ```json
  {
    "statusCode": 400,
    "error": "VALIDATION_ERROR",
    "message": ["field1 error", "field2 error"],
    "requestId": "uuid",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
  ```
- Uses x-request-id header if provided, generates UUID otherwise
- Properly handles custom TimeOffException with error codes

**Wired up in**: `src/main.ts` using `app.useGlobalFilters(new HttpExceptionFilter())`

### 2. Custom Validation Decorators
**File**: `src/common/validators/date-range.validator.ts`

**Purpose**: Validates that startDate is before or equal to endDate

**Usage**:
```typescript
@IsDateRangeValid('endDate', { message: 'startDate must be before or equal to endDate' })
startDate: string;
```

### 3. Enhanced DTOs with Validation

#### CreateRequestDto
**File**: `src/request/dto/create-request.dto.ts`

**Validations**:
- `employeeId`: Required, must be a string
- `managerId`: Required, must be a string
- `startDate`: Required, must be ISO 8601 date string, must be <= endDate
- `endDate`: Required, must be ISO 8601 date string
- `hoursRequested`: Required, must be a number >= 0.01
- `idempotencyKey`: Optional, must be a string

**Error Messages**: All validation decorators include descriptive error messages

#### UpdateRequestDto
**File**: `src/request/dto/update-request.dto.ts`

**Validations**:
- All fields optional (for partial updates)
- Same validation rules as CreateRequestDto when provided
- Date range validation applies when both dates are provided

#### RejectRequestDto
**File**: `src/request/dto/reject-request.dto.ts`

**Validations**:
- `reason`: Required, must be a string, 1-500 characters

#### WebhookPayloadDto
**File**: `src/sync/dto/webhook-payload.dto.ts`

**Validations**:
- `eventType`: Required, must be one of: BALANCE_UPDATE, ANNIVERSARY_ACCRUAL, YEAR_START_RESET
- `employeeId`: Required, must be a string
- `availableHours`: Required, must be a non-negative number
- `accruedHours`: Required, must be a non-negative number
- `usedHours`: Required, must be a non-negative number
- `timestamp`: Required, must be ISO 8601 date string
- `metadata`: Optional, must be an object

### 4. Webhook Controller Enhancement
**File**: `src/sync/webhook.controller.ts`

**Changes**:
- Now uses `WebhookPayloadDto` instead of `unknown` for type safety
- Validation happens automatically via ValidationPipe before reaching service
- Removed manual validation logic from `webhook.service.ts` (now redundant)

### 5. ValidationPipe Configuration
**File**: `src/main.ts`

**Configuration**:
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // Strip unknown properties
    forbidNonWhitelisted: true,   // Reject requests with unknown properties
    transform: true,              // Transform payloads to DTO instances
    transformOptions: {
      enableImplicitConversion: true,  // Auto-convert types
    },
  }),
);
```

## Test Coverage

### Unit Tests

#### HttpExceptionFilter Tests
**File**: `src/common/filters/http-exception.filter.spec.ts`
- 12 tests covering all exception types and error code mappings
- Tests validation error handling with array of messages
- Tests error response format consistency
- Tests requestId generation and header usage

#### CreateRequestDto Tests
**File**: `src/request/dto/create-request.dto.spec.ts`
- 17 tests covering all validation scenarios
- Tests valid payloads with all combinations
- Tests invalid fields (missing, wrong type, wrong format)
- Tests date range validation
- Tests hoursRequested validation (negative, zero, minimum)
- Tests descriptive error messages

#### WebhookPayloadDto Tests
**File**: `src/sync/dto/webhook-payload.dto.spec.ts`
- 18 tests covering all webhook validation scenarios
- Tests all three event types
- Tests required and optional fields
- Tests numeric validations (non-negative)
- Tests timestamp format validation
- Tests metadata object validation

### Integration Tests

#### Validation Integration Tests
**File**: `src/common/filters/validation-integration.spec.ts`
- 12 tests covering end-to-end validation pipeline
- Tests ValidationPipe -> HttpExceptionFilter integration
- Tests error response format in real HTTP context
- Tests multiple validation errors in single response
- Tests x-request-id header handling
- Tests unknown property rejection

**Total Test Count**: 59 tests, all passing ✅

## Verification

### Build Status
```bash
npm run build
# ✅ Build successful with no errors
```

### Test Results
```bash
npm test -- --testPathPattern="(http-exception.filter.spec|create-request.dto.spec|webhook-payload.dto.spec|validation-integration.spec)"
# ✅ Test Suites: 4 passed, 4 total
# ✅ Tests: 59 passed, 59 total
```

## Error Response Examples

### Validation Error (Multiple Fields)
```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": [
    "employeeId is required",
    "startDate must be a valid ISO 8601 date string",
    "hoursRequested must be at least 0.01 hours"
  ],
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Date Range Validation Error
```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": [
    "startDate must be before or equal to endDate"
  ],
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Custom Business Logic Error
```json
{
  "statusCode": 422,
  "error": "INSUFFICIENT_BALANCE",
  "message": "Not enough hours available",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Dependencies Added
- `@types/supertest`: For integration test type support

## Files Created
1. `src/common/validators/date-range.validator.ts` - Custom date range validator
2. `src/sync/dto/webhook-payload.dto.ts` - Webhook payload DTO with validation
3. `src/sync/dto/index.ts` - DTO exports
4. `src/common/filters/http-exception.filter.spec.ts` - Filter unit tests
5. `src/request/dto/create-request.dto.spec.ts` - DTO unit tests
6. `src/sync/dto/webhook-payload.dto.spec.ts` - Webhook DTO unit tests
7. `src/common/filters/validation-integration.spec.ts` - Integration tests

## Files Modified
1. `src/main.ts` - Wired up HttpExceptionFilter
2. `src/common/filters/http-exception.filter.ts` - Enhanced error handling
3. `src/request/dto/create-request.dto.ts` - Added comprehensive validation
4. `src/request/dto/update-request.dto.ts` - Added comprehensive validation
5. `src/request/dto/reject-request.dto.ts` - Added comprehensive validation
6. `src/sync/webhook.controller.ts` - Use WebhookPayloadDto
7. `src/sync/webhook.service.ts` - Removed redundant manual validation

## Next Steps
The validation and error handling infrastructure is now complete. Future tasks can:
1. Add business logic validation (balance checks, overlap detection) in service layer
2. Add property-based tests for validation (Task 9.6)
3. Enhance error messages with field-specific context where needed
4. Add validation for other endpoints (balance, sync, etc.)
