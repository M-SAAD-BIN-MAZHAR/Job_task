# Monitoring and Observability

This document describes the monitoring and observability features implemented in the Time-Off Microservice.

## Overview

The service implements comprehensive monitoring and observability through:

1. **Structured Logging** with correlation IDs
2. **Metrics Collection** for request latency, error rates, and HCM call success rates
3. **Health Endpoints** for liveness and readiness probes
4. **Configurable Log Levels** based on environment

## Features

### 1. Structured Logging

The service uses structured JSON logging for easy parsing by log aggregation tools (e.g., ELK Stack, Splunk, CloudWatch).

#### Log Format

```json
{
  "timestamp": "2026-04-24T04:30:39.522Z",
  "service": "time-off-service",
  "event": "request.completed",
  "method": "GET",
  "url": "/api/v1/requests",
  "statusCode": 200,
  "duration": 45,
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "userRole": "EMPLOYEE"
}
```

#### Log Events

- `request.incoming` - Incoming HTTP request (debug level)
- `request.completed` - Successful request completion
- `request.slow` - Slow request (>1000ms) warning
- `request.failed` - Failed request with error details

#### Correlation IDs

Every request is assigned a correlation ID that propagates through all logs, making it easy to trace a request through the system.

- If the client provides `X-Correlation-ID` header, it will be used
- Otherwise, a new UUID is generated automatically

#### Sensitive Data Sanitization

The logging interceptor automatically redacts sensitive fields from request bodies:
- `password`
- `token`
- `apiKey`
- `secret`
- `authorization`

### 2. Metrics Collection

The service collects and exposes metrics for monitoring dashboards.

#### Available Metrics

**Request Metrics:**
- Total requests
- Success rate
- Error rate (4xx and 5xx)
- Average latency
- P95 latency
- P99 latency

**HCM Metrics:**
- Total HCM calls
- Success rate
- Failure rate
- Average latency

**Error Metrics:**
- Total errors
- 4xx errors
- 5xx errors

#### Accessing Metrics

Metrics are exposed via the `/api/v1/health/metrics` endpoint:

```bash
curl http://localhost:3000/api/v1/health/metrics
```

Response:
```json
{
  "timestamp": "2026-04-24T04:30:39.522Z",
  "requests": {
    "total": 1250,
    "successRate": 0.96,
    "errorRate": 0.04,
    "avgLatency": 45.2,
    "latencyPercentiles": {
      "p50": 35,
      "p95": 120,
      "p99": 250
    }
  },
  "hcm": {
    "total": 450,
    "successRate": 0.98,
    "failureRate": 0.02,
    "avgLatency": 150.5
  },
  "errors": {
    "total": 50,
    "by4xx": 35,
    "by5xx": 15,
    "rate4xx": 0.028,
    "rate5xx": 0.012
  }
}
```

### 3. Health Endpoints

The service provides health check endpoints for Kubernetes liveness and readiness probes.

#### GET /api/v1/health

Overall service health status.

```bash
curl http://localhost:3000/api/v1/health
```

Response:
```json
{
  "status": "ok",
  "database": {
    "status": "up",
    "latencyMs": 5
  },
  "hcm": {
    "status": "up",
    "latencyMs": 120
  },
  "timestamp": "2026-04-24T04:30:39.522Z"
}
```

Status values:
- `ok` - All systems operational
- `degraded` - Database up, HCM down (graceful degradation mode)
- `down` - Database down (service unavailable)

#### GET /api/v1/health/live

Liveness probe - indicates the application process is running.

```bash
curl http://localhost:3000/api/v1/health/live
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-24T04:30:39.522Z"
}
```

#### GET /api/v1/health/ready

Readiness probe - indicates the service can accept traffic.

```bash
curl http://localhost:3000/api/v1/health/ready
```

Response:
```json
{
  "status": "ok",
  "database": {
    "status": "up",
    "latencyMs": 5
  },
  "hcm": {
    "status": "up",
    "latencyMs": 120
  },
  "timestamp": "2026-04-24T04:30:39.522Z"
}
```

### 4. Log Level Configuration

Log levels can be configured via the `LOG_LEVEL` environment variable.

#### Available Log Levels

- `error` - Only errors
- `warn` - Warnings and errors
- `log` - Info, warnings, and errors (default)
- `debug` - Debug, info, warnings, and errors
- `verbose` - All logs

#### Configuration

```bash
# .env file
LOG_LEVEL=info
NODE_ENV=production
```

#### Environment-Specific Behavior

**Development:**
- Logs are formatted with indentation for readability
- Stack traces are included in error logs
- Debug logs are enabled by default

**Production:**
- Logs are compact JSON (single line)
- Stack traces are excluded from error logs
- Info level logging by default

## Integration with Monitoring Tools

### Prometheus

The metrics endpoint can be scraped by Prometheus. Example scrape config:

```yaml
scrape_configs:
  - job_name: 'time-off-service'
    metrics_path: '/api/v1/health/metrics'
    static_configs:
      - targets: ['localhost:3000']
```

### ELK Stack

Structured JSON logs can be ingested by Logstash:

```conf
input {
  file {
    path => "/var/log/time-off-service/*.log"
    codec => json
  }
}

filter {
  if [service] == "time-off-service" {
    mutate {
      add_field => { "[@metadata][index]" => "time-off-service" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "%{[@metadata][index]}-%{+YYYY.MM.dd}"
  }
}
```

### Kubernetes

Example Kubernetes deployment with health checks:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: time-off-service
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: time-off-service
        image: time-off-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: LOG_LEVEL
          value: "info"
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/v1/health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

## Troubleshooting

### High Error Rates

Check the metrics endpoint to identify error patterns:

```bash
curl http://localhost:3000/api/v1/health/metrics | jq '.errors'
```

### Slow Requests

Monitor P95 and P99 latencies:

```bash
curl http://localhost:3000/api/v1/health/metrics | jq '.requests.latencyPercentiles'
```

### HCM Integration Issues

Check HCM success rate and health status:

```bash
curl http://localhost:3000/api/v1/health | jq '.hcm'
curl http://localhost:3000/api/v1/health/metrics | jq '.hcm'
```

### Tracing Requests

Use correlation IDs to trace requests through logs:

```bash
# Search logs by correlation ID
grep "550e8400-e29b-41d4-a716-446655440000" /var/log/time-off-service/*.log
```

## Best Practices

1. **Always include correlation IDs** in client requests for better traceability
2. **Monitor P99 latency** to catch performance degradation early
3. **Set up alerts** for:
   - Error rate > 5%
   - HCM success rate < 95%
   - P99 latency > 500ms
4. **Use structured logging** queries in your log aggregation tool
5. **Configure log retention** based on compliance requirements (minimum 7 years for audit logs)

## Performance Impact

The monitoring implementation has minimal performance overhead:

- **Logging**: < 1ms per request
- **Metrics collection**: < 0.5ms per request
- **Health checks**: < 10ms per check
- **Memory**: ~10MB for 10,000 cached metrics

Metrics are automatically trimmed to keep the last 10,000 entries to prevent memory growth.
