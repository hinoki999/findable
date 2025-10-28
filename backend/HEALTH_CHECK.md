# Health Check Endpoint

## Overview

The Droplin backend includes a comprehensive health check endpoint for Railway monitoring. This endpoint tests database connectivity and returns detailed service status.

## Endpoint

**URL:** `GET /health`

**Authentication:** None (public endpoint)

**Response Codes:**
- `200 OK` - Service is healthy and database is connected
- `503 Service Unavailable` - Service is unhealthy (database disconnected)

## Response Format

### Healthy Response (200 OK)

```json
{
  "status": "healthy",
  "timestamp": "2025-10-28T12:00:00.123456Z",
  "database": "connected",
  "version": "1.0.0",
  "environment": "production"
}
```

### Unhealthy Response (503 Service Unavailable)

```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-28T12:00:00.123456Z",
  "database": "disconnected",
  "error": "connection refused",
  "version": "1.0.0"
}
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall service status: `"healthy"` or `"unhealthy"` |
| `timestamp` | string | Current UTC timestamp in ISO 8601 format |
| `database` | string | Database connection status: `"connected"` or `"disconnected"` |
| `version` | string | API version number |
| `environment` | string | Current environment: `"production"` (PostgreSQL) or `"development"` (SQLite) |
| `error` | string | Error message (only present when unhealthy) |

## Usage

### Test Locally

```bash
# Using curl
curl http://localhost:8081/health

# Using PowerShell
Invoke-RestMethod -Uri "http://localhost:8081/health"
```

### Test on Railway

```bash
# Using curl
curl https://findable-production.up.railway.app/health

# Using PowerShell
Invoke-RestMethod -Uri "https://findable-production.up.railway.app/health"
```

## Railway Configuration

### 1. Configure Health Check in Railway Dashboard

1. Go to your Railway project: https://railway.app/project/[your-project-id]
2. Click on your **backend service**
3. Go to **Settings** tab
4. Scroll to **Health Check** section
5. Configure:
   - **Health Check Path:** `/health`
   - **Health Check Timeout:** `30` seconds
   - **Health Check Interval:** `60` seconds (or as needed)

### 2. Railway Health Check Settings

```yaml
# railway.toml (optional - if using config file)
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### 3. Monitor Health Status

Railway will automatically:
- ✅ Call `/health` endpoint at regular intervals
- ✅ Mark service as unhealthy if it returns 503
- ✅ Mark service as unhealthy if it doesn't respond within timeout
- ✅ Restart service based on restart policy
- ✅ Display health status in dashboard

## What Gets Checked

The health check endpoint performs the following tests:

1. **Application Responsiveness**
   - Verifies FastAPI server is running and responding to requests

2. **Database Connectivity**
   - Attempts to connect to the database (SQLite or PostgreSQL)
   - Executes a simple `SELECT 1` query
   - Closes the connection properly

3. **Timestamp Verification**
   - Ensures the system clock is working correctly

## Error Scenarios

### Database Connection Failed

**Cause:** PostgreSQL is down, credentials are wrong, or network issues

**Response:**
```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-28T12:00:00Z",
  "database": "disconnected",
  "error": "could not connect to server: Connection refused",
  "version": "1.0.0"
}
```

**Railway Action:** Service marked as unhealthy, restart may be triggered

### Service Not Responding

**Cause:** FastAPI server crashed or is overloaded

**Response:** No response (timeout)

**Railway Action:** Service marked as unhealthy, restart triggered

## Monitoring Best Practices

### 1. Set Appropriate Intervals

- **Development:** 60 seconds (less aggressive)
- **Production:** 30 seconds (catch issues quickly)
- **Critical Systems:** 10 seconds (maximum vigilance)

### 2. Configure Restart Policies

```yaml
# Recommended restart policy
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

This ensures:
- Service auto-recovers from transient failures
- Doesn't restart indefinitely if issues persist
- Gives you time to investigate persistent problems

### 3. Set Up Alerts

Configure Railway notifications:
1. Go to **Project Settings** → **Notifications**
2. Enable **Deployment Health Alerts**
3. Add your email or Slack webhook
4. Get notified when service becomes unhealthy

### 4. Monitor Response Times

Typical response times:
- **Healthy (SQLite):** < 10ms
- **Healthy (PostgreSQL local):** < 20ms
- **Healthy (PostgreSQL Railway):** < 50ms
- **Timeout threshold:** 30 seconds

If response times are consistently high, investigate:
- Database performance
- Server resource usage
- Network latency

## Integration with Load Balancers

If you add a load balancer later, configure it to use `/health`:

### AWS Application Load Balancer

```yaml
Health check:
  Protocol: HTTPS
  Path: /health
  Port: traffic-port
  Healthy threshold: 2
  Unhealthy threshold: 3
  Timeout: 5 seconds
  Interval: 30 seconds
  Success codes: 200
```

### Google Cloud Load Balancer

```yaml
Health check:
  Request path: /health
  Port: 8080
  Check interval: 30 seconds
  Timeout: 5 seconds
  Healthy threshold: 2
  Unhealthy threshold: 3
```

### Nginx (Reverse Proxy)

```nginx
upstream backend {
    server backend:8080 max_fails=3 fail_timeout=30s;
    
    # Health check (requires nginx-plus or custom module)
    health_check interval=30s fails=3 passes=2 uri=/health;
}
```

## Automated Monitoring Scripts

### PowerShell Script (Windows)

```powershell
# monitor-health.ps1
$url = "https://findable-production.up.railway.app/health"

while ($true) {
    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
        
        if ($response.status -eq "healthy") {
            Write-Host "✓ [$(Get-Date)] Service healthy - DB: $($response.database)" -ForegroundColor Green
        } else {
            Write-Host "✗ [$(Get-Date)] Service unhealthy!" -ForegroundColor Red
            # Send alert (email, Slack, etc.)
        }
    } catch {
        Write-Host "✗ [$(Get-Date)] Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 60
}
```

### Bash Script (Linux/Mac)

```bash
#!/bin/bash
# monitor-health.sh

URL="https://findable-production.up.railway.app/health"

while true; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    
    if [ "$RESPONSE" = "200" ]; then
        echo "✓ [$(date)] Service healthy"
    else
        echo "✗ [$(date)] Service unhealthy (HTTP $RESPONSE)"
        # Send alert
    fi
    
    sleep 60
done
```

## Troubleshooting

### Health Check Always Returns 503

**Possible causes:**
1. Database credentials incorrect in Railway environment variables
2. PostgreSQL service not started
3. Network connectivity issues between backend and database
4. Database max connections exceeded

**Solutions:**
```bash
# Check Railway logs
railway logs --service backend

# Verify DATABASE_URL is set
railway variables --service backend

# Test database connection manually
railway run --service backend python -c "import psycopg2; conn = psycopg2.connect('$DATABASE_URL'); print('OK')"
```

### Health Check Times Out

**Possible causes:**
1. Server overloaded (high CPU/memory usage)
2. Database query hanging
3. Network latency too high

**Solutions:**
- Scale up Railway service (more resources)
- Optimize database queries
- Check Railway metrics dashboard

### Health Check Passing But Service Not Working

**Possible causes:**
1. Health check is too simple
2. Specific endpoints failing while health check passes

**Solutions:**
- Add more comprehensive checks (e.g., check specific tables)
- Implement separate readiness and liveness checks
- Add application-level monitoring (e.g., Sentry)

## Advanced: Separate Liveness and Readiness

For Kubernetes or advanced deployments:

```python
# Liveness: Is the service alive?
@app.get("/healthz")
def liveness():
    return {"status": "alive"}

# Readiness: Is the service ready to serve traffic?
@app.get("/readyz")
def readiness():
    # More comprehensive checks
    try:
        # Check database
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, "SELECT COUNT(*) FROM users")
        conn.close()
        
        # Check external APIs (if any)
        # Check cache connectivity
        # etc.
        
        return {"status": "ready"}
    except:
        return JSONResponse(status_code=503, content={"status": "not ready"})
```

## Summary

The health check endpoint provides:

✅ **Automated monitoring** of service and database health  
✅ **Proper status codes** for load balancer integration  
✅ **Detailed diagnostics** with timestamps and error messages  
✅ **Railway integration** for automatic restarts  
✅ **Zero authentication** for unobstructed monitoring  

Configure it in Railway to ensure your service stays healthy and automatically recovers from failures!

