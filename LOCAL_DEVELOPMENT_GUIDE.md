# Local Development Guide

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

## Setup Instructions

### 1. Install Dependencies

```bash
cd time-off-service
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `time-off-service` directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your local configuration:

```env
# Local Development Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_PATH=./data/timeoff.db
JWT_SECRET=test-secret-key-for-local-development
JWT_EXPIRATION=24h
HCM_API_URL=http://localhost:3001
HCM_API_KEY=test-api-key-for-local-development
HCM_WEBHOOK_SECRET=test-webhook-secret-for-local-development
HCM_TIMEOUT_MS=5000
HCM_MAX_RETRIES=3
BALANCE_STALE_THRESHOLD_MS=300000
OUTBOX_POLL_INTERVAL_MS=5000
```

### 3. Build the Application

```bash
npm run build
```

### 4. Run the Application

#### Option 1: Development Mode (with hot reload)

```bash
npm run start:dev
```

#### Option 2: Production Mode

**Important**: When running in production mode, you must set environment variables explicitly because the compiled code doesn't automatically load the .env file.

**Windows PowerShell:**
```powershell
$env:JWT_SECRET='test-secret-key-for-local-development'
$env:HCM_API_URL='http://localhost:3001'
$env:HCM_API_KEY='test-api-key'
$env:HCM_WEBHOOK_SECRET='test-webhook-secret'
npm run start:prod
```

**Linux/Mac:**
```bash
JWT_SECRET='test-secret-key-for-local-development' \
HCM_API_URL='http://localhost:3001' \
HCM_API_KEY='test-api-key' \
HCM_WEBHOOK_SECRET='test-webhook-secret' \
npm run start:prod
```

### 5. Verify the Application is Running

Test the health endpoint:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:
```json
{
  "status": "degraded",
  "database": {
    "status": "up",
    "latencyMs": 1
  },
  "hcm": {
    "status": "down",
    "latencyMs": 60
  },
  "timestamp": "2026-04-24T06:57:16.554Z"
}
```

**Note**: The status will be "degraded" because the HCM service is not running. This is expected for local development.

## Available Endpoints

Once the application is running, you can access the following endpoints:

### Health Endpoints
- `GET /api/v1/health` - Overall health status
- `GET /api/v1/health/live` - Liveness probe
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/metrics` - Application metrics

### Balance Endpoints
- `GET /api/v1/balances/:employeeId` - Get employee balance
- `POST /api/v1/balances/:employeeId/sync` - Sync balance with HCM
- `GET /api/v1/balances/:employeeId/ledger` - Get balance ledger
- `POST /api/v1/balances/webhook` - HCM webhook endpoint

### Request Endpoints
- `POST /api/v1/requests` - Create time-off request
- `GET /api/v1/requests` - List time-off requests
- `GET /api/v1/requests/:id` - Get request details
- `PATCH /api/v1/requests/:id` - Update request
- `POST /api/v1/requests/:id/submit` - Submit request
- `POST /api/v1/requests/:id/approve` - Approve request
- `POST /api/v1/requests/:id/reject` - Reject request
- `POST /api/v1/requests/:id/cancel` - Cancel request

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:cov

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Issue: "JwtStrategy requires a secret or key"

**Cause**: Environment variables are not being loaded properly.

**Solution**: 
- For development mode: Ensure `.env` file exists in `time-off-service` directory
- For production mode: Set environment variables explicitly before running (see Option 2 above)

### Issue: "Port 3000 already in use"

**Cause**: Another process is using port 3000.

**Solution**:
- Change the `PORT` in your `.env` file to a different port (e.g., 3001)
- Or stop the process using port 3000

### Issue: "HCM service is down"

**Cause**: No HCM service is running at the configured URL.

**Solution**: This is expected for local development. The application will work in degraded mode. To test HCM integration, you need to set up a mock HCM server.

## Database

The application uses SQLite for local development. The database file is created automatically at the path specified in `DATABASE_PATH` (default: `./data/timeoff.db`).

## Next Steps

- Review the [Requirements Verification Report](REQUIREMENTS_VERIFICATION_REPORT.md)
- Check the [Railway Deployment Guide](RAILWAY_DEPLOYMENT_GUIDE.md) for production deployment
- Read the [API Documentation](time-off-service/README.md) for detailed endpoint specifications
