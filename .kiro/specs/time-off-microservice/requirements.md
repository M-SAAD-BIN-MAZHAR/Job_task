# Requirements Document: Time-Off Microservice

## Introduction

The Time-Off Microservice is an authoritative backend service for the ExampleHR Platform that manages employee time-off request lifecycles and maintains synchronized balance data with external Human Capital Management (HCM) systems. The service handles the complete workflow from request creation through approval/rejection, while ensuring consistency between ExampleHR's local state and the HCM system of record through a saga-based synchronization pattern.

The service addresses critical engineering challenges including dual-write consistency, HCM API unreliability, event-driven balance updates, race conditions, and full auditability requirements.

## Glossary

- **Time_Off_Service**: The NestJS microservice managing time-off requests and balance synchronization
- **HCM_System**: External Human Capital Management system (Workday, SAP, etc.) that is the source of truth for employee balances
- **Balance_Record**: Cached employee time-off balance data synchronized from HCM_System
- **Ledger_Entry**: Double-entry accounting record tracking all balance mutations
- **Time_Off_Request**: Employee request for time off with lifecycle state (DRAFT, PENDING, APPROVED, REJECTED, CANCELLED)
- **Outbox_Event**: Transactional outbox record ensuring reliable delivery to HCM_System
- **Approval_Saga**: Multi-step process coordinating request approval between Time_Off_Service and HCM_System
- **Sync_Checkpoint**: Reconciliation tracking record for batch synchronization operations
- **Audit_Log**: Immutable audit trail of all system operations
- **Request_Key**: Idempotency key preventing duplicate processing of retried requests
- **Balance_Drift**: Discrepancy between Balance_Record and HCM_System detected during reconciliation
- **Manager**: User with authority to approve or reject time-off requests
- **Employee**: User who can create and manage their own time-off requests
- **Admin**: User with elevated privileges for system operations and reconciliation

## Requirements

### Requirement 1: Time-Off Request Lifecycle Management

**User Story:** As an Employee, I want to create and manage time-off requests through a defined lifecycle, so that my requests are properly tracked and processed.

#### Acceptance Criteria

1. WHEN an Employee creates a time-off request, THE Time_Off_Service SHALL create a Time_Off_Request in DRAFT state
2. WHEN an Employee submits a DRAFT request, THE Time_Off_Service SHALL transition the Time_Off_Request to PENDING state
3. WHEN a Manager approves a PENDING request, THE Time_Off_Service SHALL initiate the Approval_Saga
4. WHEN the Approval_Saga completes successfully, THE Time_Off_Service SHALL transition the Time_Off_Request to APPROVED state
5. WHEN a Manager rejects a PENDING request, THE Time_Off_Service SHALL transition the Time_Off_Request to REJECTED state
6. WHEN an Employee cancels a DRAFT or PENDING request, THE Time_Off_Service SHALL transition the Time_Off_Request to CANCELLED state
7. THE Time_Off_Service SHALL prevent state transitions that violate the state machine rules (DRAFT → PENDING → APPROVED/REJECTED/CANCELLED)
8. FOR ALL Time_Off_Request state transitions, the state machine SHALL enforce valid transition paths and reject invalid transitions

### Requirement 2: Balance Synchronization with HCM System

**User Story:** As an Admin, I want employee balances to remain synchronized with the HCM System, so that time-off requests are validated against accurate balance data.

#### Acceptance Criteria

1. WHEN a balance sync is requested for an Employee, THE Time_Off_Service SHALL fetch current balance data from HCM_System
2. WHEN balance data is received from HCM_System, THE Time_Off_Service SHALL update the corresponding Balance_Record
3. WHEN a Balance_Record is updated, THE Time_Off_Service SHALL create Ledger_Entry records reflecting the balance change
4. THE Time_Off_Service SHALL cache Balance_Record data locally for read performance
5. WHEN HCM_System is unavailable, THE Time_Off_Service SHALL serve cached Balance_Record data with staleness indicators
6. THE Time_Off_Service SHALL support batch synchronization for up to 10,000 employees within 10 seconds
7. FOR ALL balance updates from HCM_System, the double-entry ledger SHALL maintain balanced debit and credit entries

### Requirement 3: Approval Saga with Dual-Write Consistency

**User Story:** As a Manager, I want approved time-off requests to be reliably synchronized with the HCM System, so that both systems remain consistent.

#### Acceptance Criteria

1. WHEN the Approval_Saga is initiated, THE Time_Off_Service SHALL create an Outbox_Event for HCM delivery
2. WHEN the Outbox_Event is created, THE Time_Off_Service SHALL deduct the requested time from the local Balance_Record
3. WHEN the local balance is updated, THE Time_Off_Service SHALL send the approval to HCM_System
4. WHEN HCM_System confirms the approval, THE Time_Off_Service SHALL mark the Outbox_Event as delivered
5. IF HCM_System rejects the approval, THEN THE Time_Off_Service SHALL rollback the local Balance_Record deduction
6. IF HCM_System rejects the approval, THEN THE Time_Off_Service SHALL transition the Time_Off_Request to REJECTED state
7. WHEN the Approval_Saga fails, THE Time_Off_Service SHALL create Ledger_Entry records for the rollback operation
8. THE Time_Off_Service SHALL ensure atomicity of local state changes and Outbox_Event creation within a single transaction
9. FOR ALL Approval_Saga executions, either both systems SHALL reflect the approval or both systems SHALL reflect the rejection (eventual consistency)

### Requirement 4: Idempotency for Network Retries

**User Story:** As a system integrator, I want duplicate requests to be safely ignored, so that network retries do not cause double-booking or inconsistent state.

#### Acceptance Criteria

1. WHEN a request includes a Request_Key, THE Time_Off_Service SHALL check for previous processing of that Request_Key
2. IF a Request_Key has been processed previously, THEN THE Time_Off_Service SHALL return the cached response without reprocessing
3. WHEN a new Request_Key is processed, THE Time_Off_Service SHALL store the Request_Key and response for future idempotency checks
4. THE Time_Off_Service SHALL maintain Request_Key records for at least 24 hours
5. WHEN HCM_System is called with a Request_Key, THE Time_Off_Service SHALL include the Request_Key in the HCM API request
6. FOR ALL operations that modify state, idempotency via Request_Key SHALL prevent duplicate state mutations

### Requirement 5: HCM Webhook Event Processing

**User Story:** As an Admin, I want the Time-Off Service to receive and process balance updates pushed from the HCM System, so that balances remain current without polling.

#### Acceptance Criteria

1. WHEN HCM_System sends a webhook event, THE Time_Off_Service SHALL authenticate the webhook request
2. WHEN a valid webhook event is received, THE Time_Off_Service SHALL extract the balance update payload
3. WHEN a balance update payload is processed, THE Time_Off_Service SHALL update the corresponding Balance_Record
4. WHEN a Balance_Record is updated via webhook, THE Time_Off_Service SHALL create Ledger_Entry records for the change
5. IF a webhook event is malformed or invalid, THEN THE Time_Off_Service SHALL return an error response and log the failure
6. THE Time_Off_Service SHALL support webhook events for balance adjustments, anniversary accruals, and year-start resets
7. FOR ALL webhook-driven balance updates, the system SHALL maintain the same consistency guarantees as API-driven updates

### Requirement 6: Batch Reconciliation with Drift Detection

**User Story:** As an Admin, I want to periodically reconcile all employee balances with the HCM System, so that any drift between systems is detected and corrected.

#### Acceptance Criteria

1. WHEN a batch reconciliation is initiated, THE Time_Off_Service SHALL fetch balance data for all employees from HCM_System
2. WHEN balance data is fetched, THE Time_Off_Service SHALL compare each Balance_Record with the corresponding HCM balance
3. WHEN a Balance_Drift is detected, THE Time_Off_Service SHALL log the discrepancy with both values
4. WHEN a Balance_Drift is detected, THE Time_Off_Service SHALL update the Balance_Record to match HCM_System
5. WHEN a reconciliation completes, THE Time_Off_Service SHALL create a Sync_Checkpoint record with drift statistics
6. THE Time_Off_Service SHALL complete batch reconciliation for 10,000 employees within 10 seconds
7. FOR ALL reconciliation operations, HCM_System SHALL be treated as the authoritative source of truth

### Requirement 7: Double-Entry Ledger for Balance Tracking

**User Story:** As an auditor, I want all balance mutations to be recorded in a double-entry ledger, so that I can trace the complete history of balance changes.

#### Acceptance Criteria

1. WHEN a balance is increased, THE Time_Off_Service SHALL create a Ledger_Entry with a credit operation
2. WHEN a balance is decreased, THE Time_Off_Service SHALL create a Ledger_Entry with a debit operation
3. WHEN a balance change is rolled back, THE Time_Off_Service SHALL create offsetting Ledger_Entry records
4. THE Time_Off_Service SHALL link each Ledger_Entry to the originating Time_Off_Request or sync operation
5. THE Time_Off_Service SHALL ensure Ledger_Entry records are immutable after creation
6. THE Time_Off_Service SHALL support querying Ledger_Entry records by employee, date range, and operation type
7. FOR ALL balance mutations, the sum of debits SHALL equal the sum of credits (double-entry invariant)

### Requirement 8: Audit Trail for All Operations

**User Story:** As a compliance officer, I want an immutable audit trail of all system operations, so that I can investigate issues and ensure regulatory compliance.

#### Acceptance Criteria

1. WHEN any state-changing operation occurs, THE Time_Off_Service SHALL create an Audit_Log entry
2. WHEN an Audit_Log entry is created, THE Time_Off_Service SHALL record the operation type, actor, timestamp, and affected entities
3. THE Time_Off_Service SHALL ensure Audit_Log entries are immutable after creation
4. THE Time_Off_Service SHALL support querying Audit_Log entries by actor, operation type, entity, and date range
5. WHEN a Time_Off_Request state transition occurs, THE Time_Off_Service SHALL record the previous state, new state, and reason
6. WHEN a balance mutation occurs, THE Time_Off_Service SHALL record the source (HCM sync, approval, rollback, webhook)
7. THE Time_Off_Service SHALL retain Audit_Log entries for at least 7 years

### Requirement 9: Race Condition Prevention for Concurrent Requests

**User Story:** As an Employee, I want concurrent time-off requests to be safely processed, so that I cannot accidentally double-book my available time.

#### Acceptance Criteria

1. WHEN multiple Time_Off_Request operations target the same Employee concurrently, THE Time_Off_Service SHALL serialize access to the Balance_Record
2. WHEN a Time_Off_Request is being approved, THE Time_Off_Service SHALL lock the corresponding Balance_Record
3. WHEN a Balance_Record is locked, THE Time_Off_Service SHALL prevent other operations from modifying that Balance_Record
4. WHEN a balance operation completes, THE Time_Off_Service SHALL release the Balance_Record lock
5. IF a balance operation times out while holding a lock, THEN THE Time_Off_Service SHALL automatically release the lock
6. THE Time_Off_Service SHALL use database-level locking mechanisms to prevent race conditions
7. FOR ALL concurrent operations on the same Balance_Record, the system SHALL prevent double-booking under any failure mode

### Requirement 10: REST API for Balance Operations

**User Story:** As a client application, I want to retrieve and manage employee balances via REST API, so that I can integrate with the Time-Off Service.

#### Acceptance Criteria

1. WHEN a GET request is made to /balances/:employeeId, THE Time_Off_Service SHALL return the current Balance_Record for that Employee
2. WHEN a POST request is made to /balances/:employeeId/sync, THE Time_Off_Service SHALL initiate a balance synchronization with HCM_System
3. WHEN a POST request is made to /balances/webhook, THE Time_Off_Service SHALL process the HCM webhook event
4. WHEN a GET request is made to /balances/:employeeId/ledger, THE Time_Off_Service SHALL return the Ledger_Entry history for that Employee
5. THE Time_Off_Service SHALL return balance data with p99 latency less than 50 milliseconds
6. THE Time_Off_Service SHALL require JWT authentication for all balance endpoints
7. THE Time_Off_Service SHALL enforce role-based access control (Employee can view own balances, Manager can view team balances, Admin can view all balances)

### Requirement 11: REST API for Time-Off Request Operations

**User Story:** As a client application, I want to create and manage time-off requests via REST API, so that I can provide a user interface for employees and managers.

#### Acceptance Criteria

1. WHEN a POST request is made to /requests, THE Time_Off_Service SHALL create a new Time_Off_Request in DRAFT state
2. WHEN a GET request is made to /requests/:requestId, THE Time_Off_Service SHALL return the Time_Off_Request details
3. WHEN a PUT request is made to /requests/:requestId, THE Time_Off_Service SHALL update the Time_Off_Request if it is in DRAFT state
4. WHEN a POST request is made to /requests/:requestId/submit, THE Time_Off_Service SHALL transition the Time_Off_Request to PENDING state
5. WHEN a POST request is made to /requests/:requestId/approve, THE Time_Off_Service SHALL initiate the Approval_Saga
6. WHEN a POST request is made to /requests/:requestId/reject, THE Time_Off_Service SHALL transition the Time_Off_Request to REJECTED state
7. WHEN a POST request is made to /requests/:requestId/cancel, THE Time_Off_Service SHALL transition the Time_Off_Request to CANCELLED state
8. WHEN a GET request is made to /requests, THE Time_Off_Service SHALL return a paginated list of Time_Off_Request records filtered by query parameters
9. THE Time_Off_Service SHALL require JWT authentication for all request endpoints
10. THE Time_Off_Service SHALL enforce role-based access control (Employee can manage own requests, Manager can approve team requests, Admin can manage all requests)

### Requirement 12: Graceful Degradation on HCM Outage

**User Story:** As an Employee, I want to view my cached balance and create draft requests even when the HCM System is unavailable, so that I can continue working during outages.

#### Acceptance Criteria

1. WHEN HCM_System is unavailable, THE Time_Off_Service SHALL serve cached Balance_Record data
2. WHEN serving cached balance data, THE Time_Off_Service SHALL include a staleness indicator showing the last sync timestamp
3. WHEN HCM_System is unavailable, THE Time_Off_Service SHALL allow creation of Time_Off_Request records in DRAFT state
4. WHEN HCM_System is unavailable, THE Time_Off_Service SHALL prevent submission of DRAFT requests to PENDING state
5. WHEN HCM_System becomes available after an outage, THE Time_Off_Service SHALL automatically process queued Outbox_Event records
6. THE Time_Off_Service SHALL expose a health endpoint indicating HCM_System availability status
7. WHEN HCM_System returns errors, THE Time_Off_Service SHALL implement exponential backoff retry logic with a maximum of 3 retries

### Requirement 13: Health and Monitoring Endpoints

**User Story:** As a DevOps engineer, I want health and monitoring endpoints, so that I can monitor service health and diagnose issues.

#### Acceptance Criteria

1. WHEN a GET request is made to /health, THE Time_Off_Service SHALL return the overall service health status
2. WHEN a GET request is made to /health/ready, THE Time_Off_Service SHALL return readiness status including database and HCM_System connectivity
3. WHEN a GET request is made to /health/live, THE Time_Off_Service SHALL return liveness status indicating the service is running
4. THE Time_Off_Service SHALL include HCM_System connectivity status in the readiness check
5. THE Time_Off_Service SHALL include database connectivity status in the readiness check
6. THE Time_Off_Service SHALL expose metrics for request latency, error rates, and HCM_System call success rates
7. THE Time_Off_Service SHALL emit structured logs for all operations including correlation IDs for request tracing

### Requirement 14: Authentication and Authorization

**User Story:** As a security administrator, I want all API endpoints to be secured with JWT authentication and role-based access control, so that only authorized users can access sensitive operations.

#### Acceptance Criteria

1. WHEN a request is made to any protected endpoint, THE Time_Off_Service SHALL validate the JWT token
2. IF a JWT token is missing or invalid, THEN THE Time_Off_Service SHALL return a 401 Unauthorized response
3. WHEN a JWT token is validated, THE Time_Off_Service SHALL extract the user role (Employee, Manager, Admin)
4. WHEN a user attempts an operation, THE Time_Off_Service SHALL verify the user has the required role for that operation
5. IF a user lacks the required role, THEN THE Time_Off_Service SHALL return a 403 Forbidden response
6. THE Time_Off_Service SHALL allow Employees to view and manage their own Time_Off_Request records
7. THE Time_Off_Service SHALL allow Managers to approve or reject Time_Off_Request records for their team members
8. THE Time_Off_Service SHALL allow Admins to perform all operations including batch reconciliation and system administration

### Requirement 15: HCM Error Response Handling

**User Story:** As a system integrator, I want the Time-Off Service to handle unreliable HCM API responses, so that silent failures do not cause data inconsistency.

#### Acceptance Criteria

1. WHEN HCM_System returns a success response for an approval, THE Time_Off_Service SHALL verify the approval by fetching the updated balance
2. IF the fetched balance does not reflect the expected deduction, THEN THE Time_Off_Service SHALL treat the approval as failed
3. WHEN HCM_System returns a success response but the balance verification fails, THE Time_Off_Service SHALL rollback the local Balance_Record
4. WHEN HCM_System returns an error response, THE Time_Off_Service SHALL log the error details and rollback the local state
5. WHEN HCM_System times out, THE Time_Off_Service SHALL treat the operation as failed and rollback the local state
6. THE Time_Off_Service SHALL implement a timeout of 5 seconds for all HCM_System API calls
7. FOR ALL HCM_System interactions, the Time_Off_Service SHALL verify the operation result rather than trusting the API response alone

### Requirement 16: Transactional Outbox Pattern

**User Story:** As a system architect, I want reliable message delivery to the HCM System using the transactional outbox pattern, so that no approved requests are lost during failures.

#### Acceptance Criteria

1. WHEN a Time_Off_Request is approved locally, THE Time_Off_Service SHALL create an Outbox_Event in the same database transaction
2. WHEN an Outbox_Event is created, THE Time_Off_Service SHALL set its status to PENDING
3. WHEN the Outbox_Event processor runs, THE Time_Off_Service SHALL fetch all PENDING Outbox_Event records
4. WHEN a PENDING Outbox_Event is processed, THE Time_Off_Service SHALL send the approval to HCM_System
5. WHEN HCM_System confirms the approval, THE Time_Off_Service SHALL update the Outbox_Event status to DELIVERED
6. IF HCM_System rejects the approval, THEN THE Time_Off_Service SHALL update the Outbox_Event status to FAILED
7. WHEN an Outbox_Event status is FAILED, THE Time_Off_Service SHALL trigger the rollback saga
8. THE Time_Off_Service SHALL process Outbox_Event records at least once every 5 seconds
9. FOR ALL approved Time_Off_Request records, an Outbox_Event SHALL be created atomically with the approval

### Requirement 17: Performance Requirements

**User Story:** As a product manager, I want the Time-Off Service to meet specific performance targets, so that the user experience remains responsive.

#### Acceptance Criteria

1. THE Time_Off_Service SHALL return balance queries with p99 latency less than 50 milliseconds
2. THE Time_Off_Service SHALL complete Time_Off_Request creation with p99 latency less than 100 milliseconds
3. THE Time_Off_Service SHALL complete batch synchronization for 10,000 employees within 10 seconds
4. THE Time_Off_Service SHALL support at least 100 concurrent requests without degradation
5. THE Time_Off_Service SHALL maintain response time targets even when HCM_System latency increases
6. THE Time_Off_Service SHALL use database connection pooling to optimize query performance
7. THE Time_Off_Service SHALL use database indexes on frequently queried fields (employeeId, requestId, status, timestamp)

### Requirement 18: Data Validation and Error Handling

**User Story:** As an Employee, I want clear error messages when my time-off request is invalid, so that I can correct the issue and resubmit.

#### Acceptance Criteria

1. WHEN a Time_Off_Request is created with invalid dates, THE Time_Off_Service SHALL return a 400 Bad Request response with a descriptive error message
2. WHEN a Time_Off_Request is created with insufficient balance, THE Time_Off_Service SHALL return a 400 Bad Request response indicating insufficient balance
3. WHEN a Time_Off_Request is submitted with overlapping dates, THE Time_Off_Service SHALL return a 400 Bad Request response indicating the conflict
4. WHEN a state transition is invalid, THE Time_Off_Service SHALL return a 400 Bad Request response with the valid transitions
5. THE Time_Off_Service SHALL validate that start date is before or equal to end date
6. THE Time_Off_Service SHALL validate that requested time does not exceed available balance
7. THE Time_Off_Service SHALL validate that the Employee exists in the system before creating a Time_Off_Request

### Requirement 19: Testing Strategy Support

**User Story:** As a QA engineer, I want comprehensive test coverage including unit, integration, contract, E2E, and chaos tests, so that I can ensure system reliability.

#### Acceptance Criteria

1. THE Time_Off_Service SHALL include unit tests for all pure functions, service logic, and state machine transitions
2. THE Time_Off_Service SHALL include integration tests using in-memory SQLite for service and repository layers
3. THE Time_Off_Service SHALL include contract tests using a mock HCM_System server with configurable responses
4. THE Time_Off_Service SHALL include E2E tests covering the full HTTP request/response cycle
5. THE Time_Off_Service SHALL include chaos tests simulating HCM_System failures, timeouts, and silent errors
6. THE Time_Off_Service SHALL provide a mock HCM_System server with fault injection capabilities for testing
7. THE Time_Off_Service SHALL achieve at least 80% code coverage across all test types

### Requirement 20: Configuration and Deployment

**User Story:** As a DevOps engineer, I want the Time-Off Service to be configurable via environment variables, so that I can deploy it across different environments without code changes.

#### Acceptance Criteria

1. THE Time_Off_Service SHALL read database connection settings from environment variables
2. THE Time_Off_Service SHALL read HCM_System API endpoint and credentials from environment variables
3. THE Time_Off_Service SHALL read JWT secret and authentication settings from environment variables
4. THE Time_Off_Service SHALL read timeout and retry configuration from environment variables
5. THE Time_Off_Service SHALL read logging level and format from environment variables
6. THE Time_Off_Service SHALL validate all required environment variables at startup
7. IF required environment variables are missing, THEN THE Time_Off_Service SHALL fail to start with a descriptive error message
