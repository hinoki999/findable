# Readiness Probe

## Overview

The Droplin backend includes a comprehensive readiness probe endpoint that verifies the application is fully ready to serve traffic. This is different from the health check (liveness probe) which only verifies the application is alive.

## Difference: Health vs Readiness

| Probe | Endpoint | Purpose | When to Use |
|-------|----------|---------|-------------|
| **Liveness** | `/health` | Is the app alive? | Restart if failing |
| **Readiness** | `/ready` | Is the app ready to serve traffic? | Remove from load balancer if failing |

## Endpoint

**URL:** `GET /ready`

**Authentication:** None (public endpoint)

**Response Codes:**
- `200 OK` - Application is ready to serve traffic
- `503 Service Unavailable` - Application is not ready (still initializing, dependencies unavailable)

## Response Format

### Ready Response (200 OK)

```json
{
  "status": "ready",
  "timestamp": "2025-10-28T12:00:00.123456Z",
  "checks": {
    "database": true,
    "environment_vars": true,
    "database_tables": true,
    "database_write": true
  },
  "version": "1.0.0",
  "environment": "production"
}
```

### Not Ready Response (503 Service Unavailable)

```json
{
  "status": "not_ready",
  "timestamp": "2025-10-28T12:00:00.123456Z",
  "checks": {
    "database": true,
    "environment_vars": true,
    "database_tables": false,
    "database_write": false
  },
  "errors": [
    "Database tables check failed: no such table: users",
    "Environment variables issue: JWT_SECRET_KEY (using default)"
  ],
  "version": "1.0.0",
  "environment": "production"
}
```

## Checks Performed

### 1. Database Connectivity
- Connects to database (SQLite or PostgreSQL)
- Executes a simple `SELECT 1` query
- Verifies database is responding

**Failure:** Database down, connection refused, credentials invalid

### 2. Environment Variables
- Checks if critical environment variables are set
- Verifies `DATABASE_URL` is set (for PostgreSQL)
- Warns if `JWT_SECRET_KEY` is using default value

**Failure:** Missing required environment variables

### 3. Database Tables
- Verifies critical tables exist:
  - `users` table
  - `devices` table
  - `audit_logs` table
- Ensures `init_db()` has run successfully

**Failure:** Tables don't exist (database not initialized)

### 4. Database Write Capability
- Currently marked as passed if tables exist
- Can be enabled to test actual write operations (commented out to avoid test data)

**Failure:** Database is read-only, permissions issue

## Usage

### Test Locally

```bash
# Using curl
curl http://localhost:8081/ready

# Using PowerShell
Invoke-RestMethod -Uri "http://localhost:8081/ready"
```

### Test on Railway

```bash
# Using curl
curl https://findable-production.up.railway.app/ready

# Using PowerShell
Invoke-RestMethod -Uri "https://findable-production.up.railway.app/ready"
```

## Railway Configuration

### Configure Readiness Probe

Railway doesn't have separate health check and readiness probe settings in the UI, but you can configure startup behavior:

**Method 1: Using Railway UI**

1. Go to Railway project → backend service
2. **Settings** → **Deploy**
3. Configure:
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/ready` (or `/health` for liveness)
   - **Health Check Timeout:** `60` seconds (longer for readiness)
   - **Health Check Interval:** `30` seconds

**Method 2: Using railway.toml**

Create `backend/railway.toml`:

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/ready"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
numReplicas = 1
```

### Startup Delay Configuration

To prevent traffic before the app is ready, configure Railway to wait:

**Option 1: Railway Service Settings**
1. **Settings** → **Deploy**
2. **Healthcheck Timeout:** `60` seconds
3. This gives the app 60 seconds to become ready before marking as failed

**Option 2: Custom Startup Script**

Create `backend/startup.sh`:

```bash
#!/bin/bash

echo "Starting Droplin backend..."

# Wait for database to be ready (Railway automatically connects services)
echo "Waiting for dependencies..."
sleep 5

# Initialize database
echo "Initializing database..."
python -c "from main import init_db; init_db()"

# Start the application
echo "Starting application..."
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Make it executable:
```bash
chmod +x backend/startup.sh
```

Update Railway start command:
```
./startup.sh
```

## Monitoring Strategy

### Recommended Setup

Use both probes for comprehensive monitoring:

1. **Liveness Probe (`/health`):**
   - Check every 30 seconds
   - Timeout: 5 seconds
   - Restart if fails 3 consecutive times

2. **Readiness Probe (`/ready`):**
   - Check every 10 seconds
   - Timeout: 10 seconds
   - Remove from load balancer if fails 2 consecutive times

### Railway Configuration

Since Railway has one health check setting, choose based on your needs:

- **Use `/health`** if you want fast restarts when app crashes
- **Use `/ready`** if you want to prevent traffic during initialization

**Recommended for Production:** Use `/health` for Railway's built-in health check, and manually query `/ready` during deployments to verify readiness.

## Use Cases

### 1. Prevent Premature Traffic

**Problem:** Users get 500 errors during deployment because app isn't ready

**Solution:** Railway waits for `/ready` to return 200 before routing traffic

### 2. Database Migration

**Problem:** App starts before database migration completes

**Solution:** `/ready` checks if tables exist, returns 503 until migration done

### 3. Dependency Validation

**Problem:** App crashes due to missing environment variables

**Solution:** `/ready` checks environment, returns 503 with specific errors

### 4. Rolling Deployments

**Problem:** Want zero-downtime deployments

**Solution:** New instances wait for `/ready` before old instances shut down

## Integration Examples

### PowerShell Monitoring Script

```powershell
# check-readiness.ps1
$url = "https://findable-production.up.railway.app/ready"

Write-Host "Checking application readiness..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec 60
    
    Write-Host "`nStatus: $($response.status)" -ForegroundColor $(if ($response.status -eq "ready") { "Green" } else { "Yellow" })
    Write-Host "Timestamp: $($response.timestamp)"
    Write-Host "`nChecks:" -ForegroundColor Cyan
    
    foreach ($check in $response.checks.PSObject.Properties) {
        $status = if ($check.Value) { "✓" } else { "✗" }
        $color = if ($check.Value) { "Green" } else { "Red" }
        Write-Host "  $status $($check.Name): $($check.Value)" -ForegroundColor $color
    }
    
    if ($response.errors) {
        Write-Host "`nErrors:" -ForegroundColor Red
        foreach ($error in $response.errors) {
            Write-Host "  • $error" -ForegroundColor Red
        }
    }
    
    if ($response.status -eq "ready") {
        Write-Host "`n✓ Application is READY to serve traffic!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n✗ Application is NOT READY" -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host "✗ Readiness check FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
```

### Bash Monitoring Script

```bash
#!/bin/bash
# check-readiness.sh

URL="https://findable-production.up.railway.app/ready"

echo "Checking application readiness..."

RESPONSE=$(curl -s -w "\n%{http_code}" "$URL")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Application is READY"
    echo "$BODY" | jq .
    exit 0
else
    echo "✗ Application is NOT READY (HTTP $HTTP_CODE)"
    echo "$BODY" | jq .
    exit 1
fi
```

### CI/CD Pipeline Integration

**GitHub Actions Example:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Railway
        run: |
          # Trigger Railway deployment
          railway up
      
      - name: Wait for deployment
        run: sleep 30
      
      - name: Check readiness
        run: |
          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://findable-production.up.railway.app/ready)
            if [ "$STATUS" = "200" ]; then
              echo "✓ Application is ready!"
              exit 0
            fi
            echo "Waiting for readiness... ($i/10)"
            sleep 10
          done
          echo "✗ Application failed to become ready"
          exit 1
```

## Troubleshooting

### Readiness Returns 503 After Deployment

**Check 1: Database Tables**
```bash
# View readiness status
curl https://findable-production.up.railway.app/ready | jq .

# Check which check is failing
curl https://findable-production.up.railway.app/ready | jq '.checks'
```

**Common causes:**
- Database not connected (`database: false`)
- Tables not created (`database_tables: false`)
- Environment variables missing (`environment_vars: false`)

**Solutions:**
```bash
# Ensure DATABASE_URL is set in Railway
railway variables --service backend

# Force database initialization
railway run python -c "from main import init_db; init_db()"

# Check Railway logs for init_db() output
railway logs --service backend
```

### Readiness Takes Too Long

**Symptom:** `/ready` times out or takes > 30 seconds

**Causes:**
- Database query is slow
- Database connection pool exhausted
- Network latency to database

**Solutions:**
- Increase readiness timeout to 60 seconds
- Add database connection pooling
- Scale up database resources
- Add indexes to tables

### False Negatives

**Symptom:** `/ready` returns 503 but app works fine

**Cause:** Check is too strict or checking wrong thing

**Solution:** Review `checks` in response to see which check is failing unnecessarily

## Best Practices

### 1. Use Both Probes

- **Liveness (`/health`)**: Simple, fast check if app is alive
- **Readiness (`/ready`)**: Comprehensive check if app is ready

### 2. Set Appropriate Timeouts

- **Liveness**: 5-10 seconds (should be fast)
- **Readiness**: 30-60 seconds (can be slower during startup)

### 3. Fail Fast on Critical Issues

Return 503 immediately if:
- Database is down
- Required environment variables missing
- Critical tables don't exist

### 4. Log Readiness Failures

The `/ready` endpoint includes detailed errors. Monitor these logs to identify deployment issues quickly.

### 5. Test Before Production

Always test readiness probe in staging:
```bash
# Simulate database down
# Simulate missing env var
# Simulate missing table
```

## Summary

The readiness probe provides:

✅ **Comprehensive startup validation** - Checks all dependencies  
✅ **Detailed diagnostics** - Returns specific errors for each check  
✅ **Prevents premature traffic** - Waits until fully initialized  
✅ **Zero-downtime deployments** - Ensures new instances are ready before routing traffic  
✅ **Environment validation** - Catches configuration issues early  

Use `/ready` to ensure your Railway deployments are fully initialized before accepting user traffic!

