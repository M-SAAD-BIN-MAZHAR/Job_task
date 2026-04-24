# Time-Off Microservice

A production-ready NestJS microservice for managing employee time-off requests with HCM system integration.

## 🚀 Features

- ✅ Complete time-off request lifecycle management (DRAFT → PENDING → APPROVED/REJECTED/CANCELLED)
- ✅ Balance synchronization with external HCM systems
- ✅ Saga pattern for distributed consistency
- ✅ Double-entry ledger for complete audit trail
- ✅ Idempotency for network retries
- ✅ Webhook processing with HMAC-SHA256 validation
- ✅ Graceful degradation during HCM outages
- ✅ JWT authentication with role-based access control
- ✅ Comprehensive health monitoring and observability
- ✅ 323 passing tests with comprehensive coverage

## 📋 Requirements

- Node.js 18+ or 20+
- npm or yarn
- SQLite (included)

## 🛠️ Installation

```bash
# Navigate to the service directory
cd time-off-service

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
```

## ⚙️ Configuration

Configure the following environment variables in `.env`:

```env
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_PATH=./data/timeoff.db

# JWT Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION=1h

# HCM System Integration
HCM_API_URL=http://localhost:4000
HCM_API_KEY=your-hcm-api-key
HCM_TIMEOUT=5000
HCM_WEBHOOK_SECRET=your-webhook-secret

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY=1000
```

## 🚀 Running the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

The API will be available at `http://localhost:3000`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run integration tests
npm run test:integration
```

**Test Results:**
- ✅ 323 tests passing
- ✅ 20 test suites
- ✅ 100% pass rate

## 📚 API Documentation

### Authentication

All endpoints (except health checks) require JWT authentication:

```bash
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### Balance Operations
- `GET /api/v1/balances/:employeeId` - Get employee balance
- `POST /api/v1/balances/:employeeId/sync` - Sync balance with HCM
- `GET /api/v1/balances/:employeeId/ledger` - Get ledger history
- `POST /api/v1/balances/webhook` - Process HCM webhook (public)

#### Request Operations
- `POST /api/v1/requests` - Create time-off request
- `GET /api/v1/requests/:requestId` - Get request details
- `PUT /api/v1/requests/:requestId` - Update draft request
- `POST /api/v1/requests/:requestId/submit` - Submit request
- `POST /api/v1/requests/:requestId/approve` - Approve request (Manager)
- `POST /api/v1/requests/:requestId/reject` - Reject request (Manager)
- `POST /api/v1/requests/:requestId/cancel` - Cancel request
- `GET /api/v1/requests` - List requests with filters

#### Health & Monitoring
- `GET /api/v1/health` - Overall health status
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/live` - Liveness probe
- `GET /api/v1/health/metrics` - Service metrics

## 🏗️ Architecture

### Hexagonal Architecture (Ports & Adapters)

```
src/
├── auth/              # Authentication & authorization
├── balance/           # Balance management
├── request/           # Time-off request management
├── ledger/            # Double-entry ledger
├── audit/             # Audit logging
├── saga/              # Saga orchestration & outbox pattern
├── sync/              # HCM synchronization & webhooks
├── health/            # Health checks & monitoring
├── hcm/               # HCM client interface & adapters
├── common/            # Shared utilities & filters
├── config/            # Configuration management
└── database/          # Database configuration
```

### Design Patterns

- **Saga Pattern**: Distributed transaction coordination
- **Transactional Outbox**: Reliable message delivery
- **Repository Pattern**: Data access abstraction
- **Double-Entry Ledger**: Complete audit trail
- **Optimistic Locking**: Concurrency control
- **Pessimistic Locking**: Race condition prevention

## 🔒 Security

- JWT token validation on all protected endpoints
- Role-based access control (Employee, Manager, Admin)
- HMAC-SHA256 webhook signature validation
- Input validation with class-validator
- SQL injection prevention (TypeORM parameterized queries)
- Comprehensive audit trail for all operations

## 📊 Performance

- Database indexes on frequently queried fields
- Connection pooling (SQLite WAL mode)
- Query result caching
- HCM availability caching (30s TTL)
- Optimized batch operations
- Efficient pagination strategies

## 📈 Monitoring

### Metrics Available
- Request latency (p50, p95, p99)
- Error rates by endpoint
- HCM call success rates
- Database query performance
- Active connections

### Health Checks
- Overall service health
- Database connectivity
- HCM system availability
- Readiness for traffic
- Liveness status

## 🔧 Development

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run build
```

### Database Migrations

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert migration
npm run migration:revert
```

## 📝 Documentation

- [Requirements Verification Report](REQUIREMENTS_VERIFICATION_REPORT.md)
- [Final Verification Summary](FINAL_VERIFICATION_SUMMARY.md)
- [Database Indexing Strategy](time-off-service/docs/DATABASE_INDEXING.md)
- [Performance Optimization Guide](time-off-service/docs/PERFORMANCE_OPTIMIZATION.md)
- [Module Architecture](time-off-service/docs/MODULE_ARCHITECTURE.md)

## 🚢 Deployment

### Recommended Platforms

1. **Railway** (Recommended)
   - Easy deployment from GitHub
   - Built-in database support
   - Free tier available

2. **Render**
   - Free tier with persistent services
   - Supports background workers

3. **Heroku**
   - Well-established platform
   - Good documentation

4. **DigitalOcean App Platform**
   - Affordable pricing
   - Managed databases

### Environment Variables for Production

Ensure all required environment variables are set:
- `NODE_ENV=production`
- `DATABASE_PATH` or database connection URL
- `JWT_SECRET` (strong secret key)
- `HCM_API_URL` and `HCM_API_KEY`
- `HCM_WEBHOOK_SECRET`

## 📄 License

UNLICENSED - Private project

## 👥 Author

ExampleHR Engineering Team

## 🤝 Contributing

This is a private project. For questions or issues, please contact the development team.

## ✅ Project Status

**Status:** Production Ready

- ✅ All 20 requirements implemented
- ✅ 160/160 acceptance criteria met
- ✅ 323 tests passing (100%)
- ✅ No compilation errors
- ✅ Security hardened
- ✅ Performance optimized
- ✅ Comprehensive documentation

## 📞 Support

For support, please contact the ExampleHR Engineering team.
