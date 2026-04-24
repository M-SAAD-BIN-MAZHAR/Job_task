# Implementation Plan: Time-Off Microservice

## Overview

This implementation plan breaks down the Time-Off Microservice into discrete, actionable tasks that build incrementally toward a complete NestJS-based service. The service manages employee time-off request lifecycles and maintains synchronized balance data with external HCM systems using a hexagonal architecture with saga pattern for distributed consistency.

The implementation follows a layered approach: infrastructure setup, core domain entities, business services, API controllers, saga orchestration, and comprehensive testing. Each task builds on previous work and includes specific acceptance criteria tied to requirements.

## Tasks

- [x] 1. Project setup and infrastructure foundation
  - [x] 1.1 Initialize NestJS project with TypeScript configuration
    - Create new NestJS project with CLI
    - Configure TypeScript with strict mode and decorators
    - Set up ESLint and Prettier for code quality
    - Configure Jest testing framework with TypeScript support
    - _Requirements: 20.1, 20.6_

  - [x] 1.2 Configure SQLite database with TypeORM
    - Install TypeORM and SQLite dependencies
    - Configure TypeORM module with SQLite connection
    - Set up database configuration with environment variables
    - Create initial database connection and migration setup
    - _Requirements: 20.1, 20.2_

  - [x] 1.3 Set up JWT authentication infrastructure
    - Install Passport and JWT dependencies
    - Configure JWT strategy with secret from environment
    - Create authentication module with JWT strategy
    - Set up role-based guards and decorators
    - _Requirements: 14.1, 14.2, 14.3, 20.3_

  - [ ]* 1.4 Write unit tests for authentication setup
    - Test JWT strategy validation
    - Test role-based guard behavior
    - Test authentication decorators
    - _Requirements: 19.1_

- [x] 2. Core domain entities and database schema
  - [x] 2.1 Create TimeOffRequest entity with state machine
    - Implement TimeOffRequest entity with all fields and relationships
    - Add optimistic locking with version field
    - Create RequestStatus enum and state machine validation
    - Set up TypeORM entity decorators and constraints
    - _Requirements: 1.1, 1.7, 1.8, 9.6_

  - [x] 2.2 Create BalanceRecord entity with staleness detection
    - Implement BalanceRecord entity with balance fields
    - Add optimistic locking for race condition prevention
    - Implement isStale computed property for cache validation
    - Set up unique constraint on employeeId
    - _Requirements: 2.1, 2.4, 2.5, 9.1, 9.2_

  - [x] 2.3 Create LedgerEntry entity for double-entry bookkeeping
    - Implement LedgerEntry entity with debit/credit operations
    - Add source tracking and metadata fields
    - Set up relationships to TimeOffRequest and SyncCheckpoint
    - Ensure immutability through entity design
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 2.4 Create OutboxEvent entity for saga pattern
    - Implement OutboxEvent entity with status tracking
    - Add retry count and error message fields
    - Set up JSON payload field for HCM communication
    - Add idempotency key support
    - _Requirements: 16.1, 16.2, 16.8, 4.5_

  - [x] 2.5 Create AuditLog and supporting entities
    - Implement AuditLog entity with operation tracking
    - Create SyncCheckpoint entity for batch reconciliation
    - Create IdempotencyKey entity for request deduplication
    - Set up all entity relationships and constraints
    - _Requirements: 8.1, 8.2, 8.3, 6.5, 4.1, 4.2_

  - [ ]* 2.6 Write property tests for entity invariants
    - **Property 1: State machine transitions are always valid**
    - **Validates: Requirements 1.7, 1.8**
    - Test that TimeOffRequest state transitions follow valid paths
    - Verify invalid transitions are rejected

  - [ ]* 2.7 Write property tests for balance record consistency
    - **Property 2: Balance calculations are always consistent**
    - **Validates: Requirements 2.4, 7.7**
    - Test that availableHours = accruedHours - usedHours
    - Verify optimistic locking prevents race conditions

  - [ ]* 2.8 Write unit tests for entity behavior
    - Test entity creation and validation
    - Test computed properties and methods
    - Test entity relationships and constraints
    - _Requirements: 19.1_

- [x] 3. Database repositories and data access layer
  - [x] 3.1 Implement TimeOffRequest repository
    - Create repository with CRUD operations
    - Add query methods for filtering by status, employee, date range
    - Implement pagination support for list operations
    - Add optimistic locking support for updates
    - _Requirements: 11.8, 9.2, 9.3_

  - [x] 3.2 Implement BalanceRecord repository
    - Create repository with balance-specific operations
    - Add methods for atomic balance updates with locking
    - Implement batch operations for reconciliation
    - Add staleness checking and sync tracking
    - _Requirements: 2.1, 2.2, 6.1, 9.1, 9.6_

  - [x] 3.3 Implement LedgerEntry repository
    - Create repository for ledger operations
    - Add query methods by employee, date range, operation type
    - Implement balance calculation from ledger entries
    - Ensure immutability of ledger records
    - _Requirements: 7.5, 7.6, 7.7_

  - [x] 3.4 Implement Outbox and Audit repositories
    - Create OutboxEvent repository with status filtering
    - Create AuditLog repository with query capabilities
    - Create SyncCheckpoint repository for reconciliation tracking
    - Create IdempotencyKey repository with expiration handling
    - _Requirements: 16.3, 8.4, 6.5, 4.3_

  - [ ]* 3.5 Write integration tests for repositories
    - Test repository operations with in-memory SQLite
    - Test transaction handling and rollback scenarios
    - Test optimistic locking and concurrency
    - _Requirements: 19.2_

- [x] 4. HCM client interface and mock implementation
  - [x] 4.1 Define HCM client port interface
    - Create IHCMClient interface with all required methods
    - Define request/response DTOs for HCM communication
    - Add health check and batch operation methods
    - Document expected behavior and error conditions
    - _Requirements: 2.1, 3.3, 6.1, 12.6, 15.6_

  - [x] 4.2 Implement mock HCM client for testing
    - Create MockHCMClient with configurable responses
    - Add fault injection capabilities for testing failures
    - Implement realistic delays and error scenarios
    - Support batch operations and health checks
    - _Requirements: 19.3, 19.6_

  - [x] 4.3 Create HCM client adapter implementation
    - Implement HTTP client for real HCM system integration
    - Add timeout configuration and retry logic
    - Implement authentication and request signing
    - Add comprehensive error handling and logging
    - _Requirements: 15.6, 12.7, 15.4, 15.5_

  - [ ]* 4.4 Write contract tests for HCM client
    - Test all HCM client methods with mock server
    - Test error handling and timeout scenarios
    - Test batch operations and performance
    - _Requirements: 19.3_

- [x] 5. Core business services implementation
  - [x] 5.1 Implement Balance Service
    - Create BalanceService with sync and update operations
    - Implement cache-first balance retrieval with staleness checks
    - Add balance deduction and restoration with ledger entries
    - Implement batch synchronization with drift detection
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.2, 6.3, 7.1, 7.2_

  - [x] 5.2 Implement Ledger Service
    - Create LedgerService for double-entry bookkeeping
    - Implement debit/credit operations with balance validation
    - Add ledger query methods and balance calculation
    - Ensure ledger integrity and immutability
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.3 Implement Request Service with state machine
    - Create RequestService with CRUD operations
    - Implement state machine validation for transitions
    - Add role-based access control for operations
    - Integrate with balance validation and audit logging
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 11.1, 11.2, 11.3, 11.4_

  - [x] 5.4 Implement Audit Service
    - Create AuditService for operation logging
    - Add automatic audit trail creation for state changes
    - Implement query methods for audit investigation
    - Ensure audit log immutability and retention
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 5.5 Write property tests for service invariants
    - **Property 3: Double-entry ledger always balances**
    - **Validates: Requirements 7.7**
    - Test that sum of debits equals sum of credits
    - Verify ledger integrity across all operations

  - [ ]* 5.6 Write property tests for balance operations
    - **Property 4: Balance operations are atomic and consistent**
    - **Validates: Requirements 2.3, 9.1, 9.2**
    - Test that balance updates are atomic with ledger entries
    - Verify race condition prevention with concurrent operations

  - [ ]* 5.7 Write unit tests for service logic
    - Test service methods with mocked dependencies
    - Test error handling and validation logic
    - Test role-based access control enforcement
    - _Requirements: 19.1_

- [ ] 6. Checkpoint - Core services validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Saga orchestration and outbox pattern
  - [x] 7.1 Implement Approval Saga Orchestrator
    - Create SagaOrchestrator for approval workflow
    - Implement executeApprovalSaga with transaction management
    - Add compensation logic for rollback scenarios
    - Integrate with outbox event creation and processing
    - _Requirements: 3.1, 3.2, 3.3, 3.8, 16.1, 16.2_

  - [x] 7.2 Implement Outbox Event Processor
    - Create OutboxProcessor for reliable message delivery
    - Add scheduled processing of pending outbox events
    - Implement retry logic with exponential backoff
    - Add HCM verification after successful delivery
    - _Requirements: 16.3, 16.4, 16.5, 16.8, 15.1, 15.2_

  - [x] 7.3 Implement Rollback Handler
    - Create RollbackHandler for saga compensation
    - Implement balance restoration with ledger entries
    - Add request status updates for failed sagas
    - Ensure atomicity of rollback operations
    - _Requirements: 3.5, 3.6, 3.7, 15.3, 15.4_

  - [ ]* 7.4 Write property tests for saga consistency
    - **Property 5: Saga operations maintain distributed consistency**
    - **Validates: Requirements 3.9**
    - Test that either both systems reflect approval or both reflect rejection
    - Verify rollback operations properly restore state

  - [ ]* 7.5 Write property tests for outbox reliability
    - **Property 6: Outbox events are processed at-least-once**
    - **Validates: Requirements 16.8, 16.9**
    - Test that outbox events are created atomically with state changes
    - Verify events are processed reliably with retries

  - [ ]* 7.6 Write chaos tests for saga resilience
    - Test saga behavior with HCM failures and timeouts
    - Test rollback scenarios with various failure modes
    - Test outbox processing with database failures
    - _Requirements: 19.5_

- [ ] 8. Idempotency and synchronization services
  - [x] 8.1 Implement Idempotency Service
    - Create IdempotencyService for request deduplication
    - Add key generation and response caching
    - Implement automatic cleanup of expired keys
    - Integrate with all state-changing operations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 8.2 Implement Sync Service for reconciliation
    - Create SyncService for batch balance reconciliation
    - Implement drift detection and correction logic
    - Add checkpoint tracking and progress reporting
    - Optimize for performance with batch operations
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 17.3_

  - [x] 8.3 Implement Webhook Service for HCM events
    - Create WebhookService for processing HCM balance updates
    - Add authentication and payload validation
    - Implement balance update processing with ledger entries
    - Add error handling and response formatting
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 8.4 Write property tests for idempotency
    - **Property 7: Idempotent operations produce consistent results**
    - **Validates: Requirements 4.6**
    - Test that repeated requests with same key return same response
    - Verify no duplicate state mutations occur

  - [ ]* 8.5 Write property tests for synchronization
    - **Property 8: Reconciliation converges to HCM truth**
    - **Validates: Requirements 6.7**
    - Test that batch reconciliation corrects all drift
    - Verify HCM system is treated as authoritative source

  - [ ]* 8.6 Write unit tests for sync and webhook services
    - Test webhook authentication and validation
    - Test reconciliation logic and drift detection
    - Test idempotency key management and cleanup
    - _Requirements: 19.1_

- [ ] 9. REST API controllers and HTTP layer
  - [x] 9.1 Implement Balance Controller
    - Create BalanceController with all balance endpoints
    - Add GET /balances/:employeeId for balance retrieval
    - Add POST /balances/:employeeId/sync for manual sync
    - Add GET /balances/:employeeId/ledger for ledger history
    - Implement role-based access control and JWT authentication
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.2 Implement Request Controller
    - Create RequestController with all request endpoints
    - Add CRUD operations for time-off requests
    - Add state transition endpoints (submit, approve, reject, cancel)
    - Add pagination and filtering for request lists
    - Implement role-based access control for all operations
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [x] 9.3 Implement Webhook Controller
    - Create WebhookController for HCM webhook processing
    - Add POST /balances/webhook endpoint
    - Implement authentication and payload validation
    - Add error handling and appropriate HTTP responses
    - _Requirements: 10.3, 5.1, 5.2, 5.5_

  - [x] 9.4 Add request validation and error handling
    - Implement DTOs with validation decorators
    - Add global exception filter for consistent error responses
    - Implement data validation for all endpoints
    - Add descriptive error messages for validation failures
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ]* 9.5 Write property tests for API behavior
    - **Property 9: API endpoints enforce consistent access control**
    - **Validates: Requirements 14.4, 14.5, 14.6, 14.7, 14.8**
    - Test that role-based access is enforced across all endpoints
    - Verify authentication requirements are consistently applied

  - [ ]* 9.6 Write property tests for request validation
    - **Property 10: Invalid requests consistently return appropriate errors**
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4**
    - Test that validation errors return consistent 400 responses
    - Verify error messages are descriptive and actionable

  - [ ]* 9.7 Write E2E tests for API endpoints
    - Test complete HTTP request/response cycles
    - Test authentication and authorization flows
    - Test error scenarios and edge cases
    - _Requirements: 19.4_

- [ ] 10. Health monitoring and graceful degradation
  - [x] 10.1 Implement Health Controller
    - Create HealthController with health check endpoints
    - Add GET /health for overall service health
    - Add GET /health/ready for readiness checks
    - Add GET /health/live for liveness checks
    - Include database and HCM connectivity status
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 10.2 Implement graceful degradation logic
    - Add HCM availability detection and caching
    - Implement cache-first serving during outages
    - Add staleness indicators for cached data
    - Prevent request submissions during HCM outages
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 10.3 Add monitoring and observability
    - Implement structured logging with correlation IDs
    - Add metrics for request latency and error rates
    - Add HCM call success rate monitoring
    - Configure log levels and output formatting
    - _Requirements: 13.6, 13.7, 20.5_

  - [ ]* 10.4 Write property tests for health checks
    - **Property 11: Health status accurately reflects system state**
    - **Validates: Requirements 13.4, 13.5**
    - Test that health checks correctly report component status
    - Verify degradation behavior during outages

  - [ ]* 10.5 Write unit tests for monitoring components
    - Test health check logic and status reporting
    - Test graceful degradation scenarios
    - Test logging and metrics collection
    - _Requirements: 19.1_

- [ ] 11. Configuration and environment setup
  - [x] 11.1 Implement configuration validation
    - Create configuration classes with validation decorators
    - Add environment variable mapping and type conversion
    - Implement startup validation for required configuration
    - Add configuration documentation and examples
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x] 11.2 Set up application modules and dependency injection
    - Configure all NestJS modules with proper dependencies
    - Set up database connection with configuration
    - Configure JWT authentication with environment secrets
    - Wire up all services and controllers
    - _Requirements: 20.1, 20.2, 20.3_

  - [ ]* 11.3 Write property tests for configuration
    - **Property 12: Missing required configuration causes startup failure**
    - **Validates: Requirements 20.7**
    - Test that application fails to start with missing config
    - Verify configuration validation works correctly

  - [ ]* 11.4 Write unit tests for configuration setup
    - Test configuration validation and error handling
    - Test module initialization and dependency injection
    - Test environment variable processing
    - _Requirements: 19.1_

- [ ] 12. Checkpoint - Integration validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Performance optimization and database indexing
  - [x] 13.1 Add database indexes for query optimization
    - Create indexes on frequently queried fields
    - Add composite indexes for complex queries
    - Optimize balance and request lookup performance
    - Add indexes for audit and ledger queries
    - _Requirements: 17.7, 10.5, 17.1_

  - [x] 13.2 Implement connection pooling and caching
    - Configure database connection pooling
    - Add query result caching where appropriate
    - Optimize batch operations for performance
    - Implement efficient pagination strategies
    - _Requirements: 17.6, 17.2, 17.3, 17.4_

  - [ ]* 13.3 Write performance tests
    - Test API response times under load
    - Test batch reconciliation performance
    - Test concurrent request handling
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 14. Comprehensive testing suite
  - [~] 14.1 Create mock HCM server for testing
    - Implement configurable mock server with fault injection
    - Add realistic response delays and error scenarios
    - Support all HCM API endpoints with proper responses
    - Enable chaos testing capabilities
    - _Requirements: 19.6_

  - [~] 14.2 Implement integration test suite
    - Create integration tests using in-memory SQLite
    - Test service layer interactions with database
    - Test saga orchestration with mock HCM
    - Test webhook processing end-to-end
    - _Requirements: 19.2_

  - [~] 14.3 Implement E2E test suite
    - Create E2E tests covering full HTTP workflows
    - Test complete request lifecycle scenarios
    - Test authentication and authorization flows
    - Test error handling and edge cases
    - _Requirements: 19.4_

  - [~] 14.4 Implement chaos testing suite
    - Create chaos tests for HCM failures and timeouts
    - Test database connection failures and recovery
    - Test concurrent operation scenarios
    - Test system behavior under various failure modes
    - _Requirements: 19.5_

  - [ ]* 14.5 Achieve comprehensive test coverage
    - Ensure unit test coverage meets 80% threshold
    - Verify all critical paths are tested
    - Add missing tests for edge cases
    - _Requirements: 19.7_

- [ ] 15. Final integration and deployment preparation
  - [~] 15.1 Create application entry point and startup
    - Implement main.ts with proper error handling
    - Add graceful shutdown handling
    - Configure global middleware and interceptors
    - Set up OpenAPI documentation generation
    - _Requirements: 20.6, 20.7_

  - [~] 15.2 Add database migrations and seeding
    - Create TypeORM migrations for all entities
    - Add database seeding for development and testing
    - Implement migration rollback capabilities
    - Document database schema and relationships
    - _Requirements: 20.1, 20.2_

  - [~] 15.3 Create deployment configuration
    - Add Docker configuration for containerization
    - Create environment-specific configuration files
    - Add deployment scripts and documentation
    - Configure logging and monitoring for production
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 15.4 Write deployment and configuration tests
    - Test application startup with various configurations
    - Test Docker container build and execution
    - Test migration execution and rollback
    - _Requirements: 19.1_

- [ ] 16. Final checkpoint - Complete system validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability and validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests verify service layer interactions with database
- E2E tests validate complete HTTP request/response workflows
- Chaos tests ensure system resilience under failure conditions
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- The implementation uses TypeScript with NestJS framework as specified in the design
- All database operations use TypeORM with SQLite for development and testing
- Authentication uses JWT with role-based access control (Employee, Manager, Admin)
- The saga pattern ensures distributed consistency between local state and HCM system
- Double-entry ledger provides complete audit trail for all balance mutations
- Idempotency prevents duplicate processing of retried requests
- Graceful degradation maintains service availability during HCM outages