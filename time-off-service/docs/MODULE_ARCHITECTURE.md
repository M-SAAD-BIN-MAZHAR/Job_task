# Module Architecture Documentation

## Overview

The Time-Off Microservice follows a modular architecture using NestJS modules to organize code by domain and responsibility. The application uses dependency injection to wire services, repositories, and controllers together while maintaining clear boundaries between modules.

## Module Dependency Graph

```
AppModule (Root)
├── ConfigModule (Global)
├── ScheduleModule (Global)
├── CommonModule (Global)
│   └── MetricsService
├── DatabaseModule
│   └── TypeORM DataSource
├── AuthModule
│   ├── JwtStrategy
│   ├── JwtAuthGuard
│   └── RolesGuard
├── HcmModule
│   └── HCM_CLIENT (IHCMClient)
├── IdempotencyModule
│   ├── IdempotencyService
│   └── IdempotencyRepository
├── LedgerModule
│   ├── LedgerService
│   └── LedgerRepository
├── AuditModule
│   ├── AuditService
│   └── AuditRepository
├── BalanceModule ⟷ SyncModule (circular)
│   ├── BalanceController
│   ├── BalanceService
│   ├── BalanceRepository
│   └── Depends on: LedgerModule, AuditModule, HcmModule, SyncModule
├── RequestModule ⟷ SagaModule (circular)
│   ├── RequestController
│   ├── RequestService
│   ├── RequestRepository
│   └── Depends on: AuditModule, BalanceModule, SagaModule
├── SagaModule ⟷ RequestModule (circular)
│   ├── ApprovalSagaOrchestrator
│   ├── OutboxRepository
│   ├── RollbackHandler
│   └── Depends on: BalanceModule, AuditModule, HcmModule, LedgerModule, RequestModule
├── SyncModule ⟷ BalanceModule (circular)
│   ├── WebhookController
│   ├── SyncService
│   ├── ReconciliationService
│   ├── WebhookService
│   ├── SyncRepository
│   └── Depends on: HcmModule, LedgerModule, AuditModule, BalanceModule
└── HealthModule
    ├── HealthController
    └── Depends on: HcmModule
```

## Module Descriptions

### Core Infrastructure Modules

#### ConfigModule
- **Purpose**: Global configuration management using environment variables
- **Scope**: Global (available to all modules)
- **Key Features**:
  - Environment variable validation on startup
  - Type-safe configuration access via ConfigService
  - Support for .env files

#### DatabaseModule
- **Purpose**: Database connection and TypeORM configuration
- **Exports**: TypeORM DataSource
- **Configuration**:
  - SQLite database (configurable path)
  - Auto-load entities
  - Synchronization control
  - Connection pooling

#### CommonModule
- **Purpose**: Shared utilities and services
- **Scope**: Global (available to all modules)
- **Exports**:
  - MetricsService (for monitoring and observability)
- **Global Providers**:
  - HttpExceptionFilter (APP_FILTER)
  - CorrelationIdInterceptor (APP_INTERCEPTOR)
  - LoggingInterceptor (APP_INTERCEPTOR)
  - MetricsInterceptor (APP_INTERCEPTOR)

#### AuthModule
- **Purpose**: JWT authentication and authorization
- **Exports**:
  - JwtModule (for token generation)
  - PassportModule (for authentication strategies)
- **Global Guards**:
  - JwtAuthGuard (APP_GUARD) - validates JWT tokens
  - RolesGuard (APP_GUARD) - enforces role-based access control

### Domain Modules

#### HcmModule
- **Purpose**: Integration with external HCM system
- **Exports**: HCM_CLIENT provider (IHCMClient interface)
- **Implementation**: HcmClientAdapter (HTTP client with retry logic)
- **Key Features**:
  - Balance retrieval from HCM
  - Request submission to HCM
  - Batch operations support
  - Health check endpoint
  - Configurable timeout and retry

#### LedgerModule
- **Purpose**: Double-entry bookkeeping for balance mutations
- **Exports**:
  - LedgerService
  - LedgerRepository
- **Key Features**:
  - Immutable ledger entries
  - Debit/credit operations
  - Balance calculation from ledger
  - Audit trail for all balance changes

#### AuditModule
- **Purpose**: Audit logging for all operations
- **Exports**:
  - AuditService
  - AuditRepository
- **Key Features**:
  - Automatic audit trail creation
  - Operation tracking with metadata
  - Query capabilities for investigation
  - Immutable audit logs

#### IdempotencyModule
- **Purpose**: Request deduplication and idempotency
- **Exports**: IdempotencyService
- **Key Features**:
  - Idempotency key management
  - Response caching
  - Automatic cleanup of expired keys
  - Integration with state-changing operations

### Business Logic Modules

#### BalanceModule
- **Purpose**: Employee balance management
- **Controllers**: BalanceController
- **Exports**:
  - BalanceService
  - BalanceRepository
- **Dependencies**: LedgerModule, AuditModule, HcmModule, SyncModule
- **Key Features**:
  - Cache-first balance retrieval
  - Staleness detection
  - Manual synchronization
  - Ledger history queries
  - Balance deduction and restoration

#### RequestModule
- **Purpose**: Time-off request lifecycle management
- **Controllers**: RequestController
- **Exports**:
  - RequestService
  - RequestRepository
- **Dependencies**: AuditModule, BalanceModule, SagaModule
- **Key Features**:
  - CRUD operations for requests
  - State machine validation
  - Role-based access control
  - Pagination and filtering
  - State transition operations

#### SagaModule
- **Purpose**: Distributed transaction orchestration
- **Exports**:
  - ApprovalSagaOrchestrator
  - OutboxRepository
  - RollbackHandler
- **Dependencies**: BalanceModule, AuditModule, HcmModule, LedgerModule, RequestModule
- **Key Features**:
  - Approval saga orchestration
  - Transactional outbox pattern
  - Compensation logic for rollbacks
  - Retry with exponential backoff
  - HCM verification after delivery

#### SyncModule
- **Purpose**: Balance synchronization and reconciliation
- **Controllers**: WebhookController
- **Exports**:
  - SyncService
  - ReconciliationService
  - WebhookService
  - SyncRepository
- **Dependencies**: HcmModule, LedgerModule, AuditModule, BalanceModule
- **Key Features**:
  - Batch reconciliation
  - Drift detection and correction
  - Webhook processing for HCM events
  - Checkpoint tracking
  - Performance optimization for large batches

#### HealthModule
- **Purpose**: Health checks and monitoring
- **Controllers**: HealthController
- **Dependencies**: HcmModule
- **Key Features**:
  - Overall health status
  - Readiness checks
  - Liveness checks
  - Metrics endpoint
  - Database and HCM connectivity status

## Circular Dependencies

The application has two intentional circular dependencies that are resolved using NestJS's `forwardRef()`:

### 1. BalanceModule ⟷ SyncModule
- **Reason**: 
  - BalanceModule needs SyncService for synchronization operations
  - SyncModule needs BalanceRepository for updating balances during reconciliation
- **Resolution**: SyncModule uses `forwardRef(() => BalanceModule)`

### 2. RequestModule ⟷ SagaModule
- **Reason**:
  - RequestModule needs ApprovalSagaOrchestrator for approval workflows
  - SagaModule needs RequestRepository for updating request status
- **Resolution**: Both modules use `forwardRef()` to break the circular dependency

## Global Providers

### Exception Handling
- **HttpExceptionFilter**: Provides consistent error response format across all endpoints
- **Format**: `{ statusCode, error, message, requestId, timestamp }`

### Interceptors
1. **CorrelationIdInterceptor**: Adds correlation IDs to all requests for tracing
2. **LoggingInterceptor**: Structured logging with request/response details
3. **MetricsInterceptor**: Collects metrics for monitoring and observability

### Guards
1. **JwtAuthGuard**: Validates JWT tokens on all endpoints (except public routes)
2. **RolesGuard**: Enforces role-based access control based on @Roles decorator

## Configuration Validation

The application validates required environment variables on startup using the `validateEnvironment` function:

### Required Variables
- `DATABASE_PATH`: Path to SQLite database file
- `JWT_SECRET`: Secret key for JWT token signing
- `HCM_BASE_URL`: Base URL for HCM system API
- `HCM_API_KEY`: API key for HCM authentication

### Optional Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (default: development)
- `JWT_EXPIRATION`: JWT token expiration (default: 24h)
- `HCM_TIMEOUT`: HCM request timeout in ms (default: 5000)
- `HCM_MAX_RETRIES`: Maximum retry attempts (default: 3)
- `LOG_LEVEL`: Logging level (default: info)

## Module Wiring Verification

The module wiring is verified through integration tests in `test/app.module.integration.spec.ts`:

### Test Coverage
- ✅ Core module dependencies (Database, Config)
- ✅ Service layer wiring (all services resolve correctly)
- ✅ HCM client provider resolution
- ✅ Circular dependency resolution
- ✅ Global providers (filters, interceptors, guards)
- ✅ Module export verification
- ✅ Configuration validation

### Running Module Wiring Tests
```bash
npm test -- app.module.integration.spec.ts
```

## Best Practices

### Module Organization
1. **Single Responsibility**: Each module has a clear, focused purpose
2. **Explicit Dependencies**: All dependencies are declared in module imports
3. **Proper Exports**: Only export what other modules need to consume
4. **Global Modules**: Use sparingly (only for truly cross-cutting concerns)

### Dependency Injection
1. **Constructor Injection**: All dependencies injected via constructor
2. **Interface-Based**: Use interfaces (like IHCMClient) for flexibility
3. **Provider Tokens**: Use string tokens for interface-based providers
4. **Circular Dependencies**: Minimize and use forwardRef() when necessary

### Testing
1. **Unit Tests**: Test services in isolation with mocked dependencies
2. **Integration Tests**: Test module wiring and service interactions
3. **E2E Tests**: Test complete HTTP request/response workflows

## Troubleshooting

### Common Issues

#### Module Not Found
- Ensure the module is imported in AppModule or parent module
- Check that the module exports the required providers

#### Circular Dependency Error
- Use `forwardRef()` to break the cycle
- Consider refactoring to remove the circular dependency

#### Provider Not Found
- Verify the provider is declared in the module's providers array
- Check that the module is imported where the provider is needed
- Ensure the provider is exported if used by other modules

#### Configuration Validation Failure
- Check that all required environment variables are set
- Verify .env file is in the correct location
- Ensure environment variable names match exactly
