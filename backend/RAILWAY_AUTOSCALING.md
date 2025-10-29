# Railway Auto-Scaling Configuration

## Important: Railway Auto-Scaling Capabilities

As of 2025, **Railway's auto-scaling features are limited compared to Kubernetes or AWS**. Here's what's currently available:

### ✅ Available on Railway

| Feature | Availability | Configuration |
|---------|-------------|---------------|
| **Fixed Replicas** | ✅ All Plans | Set exact number (e.g., 2 replicas) |
| **Manual Scaling** | ✅ All Plans | Change replica count via dashboard |
| **Resource Limits** | ✅ Pro Plan | CPU and memory limits per service |
| **Health-Based Restart** | ✅ All Plans | Auto-restart unhealthy replicas |
| **Horizontal Scaling** | ✅ Pro Plan | Multiple replicas load-balanced |

### ❌ Not Yet Available on Railway

| Feature | Status | Alternative |
|---------|--------|-------------|
| **CPU-Based Auto-Scaling** | ❌ Not supported | Use monitoring + manual scaling |
| **Memory-Based Auto-Scaling** | ❌ Not supported | Set fixed replicas based on expected load |
| **Custom Scaling Rules** | ❌ Not supported | Use Railway API + external monitoring |
| **Scale-to-Zero** | ❌ Not supported (keeps min replicas) | Use Railway's built-in sleep feature |

## Recommended Configuration

Since Railway doesn't have native auto-scaling based on CPU/memory metrics, here's the **best practice approach**:

### Option 1: Proactive Fixed Scaling (Recommended)

Set replicas based on expected traffic patterns:

```toml
# backend/railway.toml

[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4"
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

# Set replicas based on traffic expectations
# Low traffic: 2 replicas
# Medium traffic: 4-6 replicas
# High traffic: 8-10 replicas
numReplicas = 2

# Railway will distribute traffic across all replicas
# Each replica gets 1/N of total traffic
```

**Benefits:**
- ✅ Predictable performance
- ✅ No unexpected scaling delays
- ✅ Simple to manage

**Drawbacks:**
- ⚠️ Fixed cost (doesn't scale down during low traffic)
- ⚠️ May over-provision during quiet periods

### Option 2: Manual Scaling with Monitoring

Use Railway metrics + manual scaling during peak times:

**Steps:**

1. **Monitor in Railway Dashboard**
   - Go to backend service → Metrics
   - Watch CPU and memory usage
   - Look for sustained high usage patterns

2. **Scale Manually When Needed**
   ```
   Traffic spike detected:
   - Go to Settings → Replicas
   - Increase from 2 → 6
   - Save
   
   Traffic returns to normal:
   - Decrease from 6 → 2
   - Save
   ```

3. **Set Up Alerts**
   - Railway → Project Settings → Notifications
   - Enable deployment and health alerts
   - Get notified when issues occur

### Option 3: API-Based Auto-Scaling (Advanced)

Use Railway API with external monitoring for pseudo-auto-scaling:

**Architecture:**
```
Your Monitoring Service (Datadog/CloudWatch)
           ↓
    Detects high CPU/memory
           ↓
    Calls Railway API
           ↓
    Updates replica count
```

**Implementation sketch:**

```python
# external-autoscaler.py (run on separate service)
import requests
import time

RAILWAY_API_TOKEN = "your-token"
SERVICE_ID = "your-service-id"
RAILWAY_API = "https://backboard.railway.app/graphql"

def get_current_metrics():
    # Query Railway API for service metrics
    # (Railway API documentation: https://docs.railway.app/reference/public-api)
    pass

def scale_service(replica_count):
    mutation = """
    mutation serviceUpdate($serviceId: String!, $replicas: Int!) {
        serviceUpdate(id: $serviceId, input: {numReplicas: $replicas}) {
            id
            numReplicas
        }
    }
    """
    
    headers = {
        "Authorization": f"Bearer {RAILWAY_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(
        RAILWAY_API,
        json={
            "query": mutation,
            "variables": {
                "serviceId": SERVICE_ID,
                "replicas": replica_count
            }
        },
        headers=headers
    )
    
    return response.json()

def auto_scale():
    while True:
        # Get current metrics from Railway or external monitoring
        cpu_usage = get_current_metrics()
        
        if cpu_usage > 70:
            # Scale up
            scale_service(replica_count=4)
        elif cpu_usage < 30:
            # Scale down
            scale_service(replica_count=2)
        
        time.sleep(60)  # Check every minute

# Note: This is a simplified example
# Production implementation would need:
# - Cooldown periods
# - Rate limiting
# - Error handling
# - Proper logging
```

## Resource Limits Configuration

### Set Resource Limits in Railway

Railway allows setting resource limits per service:

**Via Railway Dashboard:**

1. **Go to backend service → Settings**
2. **Scroll to "Resources"**
3. **Configure:**
   - **CPU Limit:** 2 vCPUs per replica (default)
   - **Memory Limit:** 8 GB per replica (default)
   - Railway auto-adjusts based on plan

**Via railway.toml (if supported):**

```toml
[deploy]
# Note: Railway may not respect all of these settings
# Check Railway documentation for current capabilities

# These are recommended values per replica:
# - Small: 0.5 vCPU, 1GB RAM (low traffic)
# - Medium: 1 vCPU, 2GB RAM (normal traffic)
# - Large: 2 vCPU, 4GB RAM (high traffic)
```

## Connection Limits per Replica

### Configure Uvicorn Workers

Limit concurrent connections per replica:

**Update `railway.toml`:**

```toml
[deploy]
# Multiple Uvicorn workers per replica
# Each worker can handle ~1000 concurrent connections
# Formula: workers = (2 x CPU cores) + 1

# For 1 vCPU: --workers 3
# For 2 vCPU: --workers 5
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4 --limit-concurrency 1000"

# Explained:
# --workers 4: Run 4 Uvicorn worker processes
# --limit-concurrency 1000: Max 1000 concurrent requests per replica
# With 2 replicas: Total capacity = 2000 concurrent requests
```

### Database Connection Pooling

Limit database connections per replica:

**Update `backend/main.py`:**

```python
# Add connection pooling configuration
import os
from contextlib import contextmanager

# Maximum database connections per replica
MAX_DB_CONNECTIONS = 20  # PostgreSQL on Railway handles ~100 total connections
                         # With 2 replicas: 20 x 2 = 40 connections (safe)

# Simple connection counter (for production, use proper pooling)
_db_connection_count = 0
_max_connections = MAX_DB_CONNECTIONS

@contextmanager
def db_connection_pool():
    global _db_connection_count
    
    if _db_connection_count >= _max_connections:
        raise Exception("Database connection pool exhausted")
    
    _db_connection_count += 1
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()
        _db_connection_count -= 1

# Note: For production, consider using SQLAlchemy connection pooling:
# from sqlalchemy import create_engine, pool
# engine = create_engine(
#     DATABASE_URL,
#     poolclass=pool.QueuePool,
#     pool_size=10,
#     max_overflow=10
# )
```

## Load Testing Configuration

### Test 1: Stress Test Single Replica

**Using Apache Bench (ab):**

```bash
# Install Apache Bench
# Windows: Download from Apache website
# Mac: brew install httpd
# Linux: sudo apt install apache2-utils

# Test with increasing load
ab -n 1000 -c 50 https://findable-production.up.railway.app/health
# -n 1000: Total requests
# -c 50: Concurrent requests
```

**Using PowerShell:**

```powershell
# load-test.ps1
$url = "https://findable-production.up.railway.app/health"
$concurrent = 50
$total = 1000

Write-Host "Load Testing: $total requests, $concurrent concurrent" -ForegroundColor Cyan

$jobs = @()
$successCount = 0
$failCount = 0

for ($i = 1; $i -le $total; $i += $concurrent) {
    $batch = @()
    
    for ($j = 0; $j -lt $concurrent -and ($i + $j) -le $total; $j++) {
        $batch += Start-Job -ScriptBlock {
            param($url)
            try {
                Invoke-RestMethod -Uri $url -TimeoutSec 10
                return "success"
            } catch {
                return "failed"
            }
        } -ArgumentList $url
    }
    
    # Wait for batch to complete
    $results = $batch | Wait-Job | Receive-Job
    $batch | Remove-Job
    
    $successCount += ($results | Where-Object { $_ -eq "success" }).Count
    $failCount += ($results | Where-Object { $_ -eq "failed" }).Count
    
    Write-Host "Progress: $($i + $concurrent)/$total - Success: $successCount, Failed: $failCount" -ForegroundColor Gray
}

Write-Host "`nResults:" -ForegroundColor Cyan
Write-Host "  Successful: $successCount/$total" -ForegroundColor Green
Write-Host "  Failed: $failCount/$total" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
```

### Test 2: Monitor During Load

**Monitor Railway metrics during load test:**

```powershell
# monitor-during-load.ps1
$url = "https://findable-production.up.railway.app/health"

Write-Host "Monitoring service during load..." -ForegroundColor Cyan
Write-Host "Open Railway dashboard to see CPU/Memory metrics" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    $start = Get-Date
    
    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 5
        $duration = (Get-Date) - $start
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Response time: $($duration.TotalMilliseconds)ms" -ForegroundColor Green
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ Request failed" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}
```

**What to watch in Railway Dashboard:**
- CPU usage per replica
- Memory usage per replica
- Response times
- Error rates

### Test 3: Simulate Traffic Spike

```powershell
# simulate-spike.ps1
$url = "https://findable-production.up.railway.app/health"

Write-Host "Simulating Traffic Spike" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Phase 1: Normal load (10 req/sec for 1 min)
Write-Host "`nPhase 1: Normal load (10 req/sec)..." -ForegroundColor Yellow
for ($i = 1; $i -le 60; $i++) {
    Invoke-RestMethod -Uri $url -TimeoutSec 5 > $null
    Start-Sleep -Milliseconds 100
}

# Phase 2: Traffic spike (100 req/sec for 2 min)
Write-Host "Phase 2: Traffic spike (100 req/sec)..." -ForegroundColor Red
$start = Get-Date
while ((Get-Date) - $start -lt [TimeSpan]::FromMinutes(2)) {
    1..10 | ForEach-Object {
        Start-Job -ScriptBlock { 
            param($url)
            Invoke-RestMethod -Uri $url -TimeoutSec 5 > $null
        } -ArgumentList $url
    } | Wait-Job | Remove-Job
    
    Start-Sleep -Milliseconds 100
}

# Phase 3: Return to normal
Write-Host "Phase 3: Returning to normal load..." -ForegroundColor Yellow
for ($i = 1; $i -le 60; $i++) {
    Invoke-RestMethod -Uri $url -TimeoutSec 5 > $null
    Start-Sleep -Milliseconds 100
}

Write-Host "`n✓ Spike test complete" -ForegroundColor Green
Write-Host "Check Railway dashboard for CPU/memory impact" -ForegroundColor Cyan
```

## Recommended Scaling Strategy

### Traffic-Based Replica Configuration

| Expected Traffic | Replicas | Workers per Replica | Total Capacity |
|-----------------|----------|---------------------|----------------|
| **Low** (< 100 req/min) | 2 | 2 | ~4,000 concurrent |
| **Medium** (100-500 req/min) | 4 | 4 | ~16,000 concurrent |
| **High** (500-2000 req/min) | 6 | 4 | ~24,000 concurrent |
| **Very High** (> 2000 req/min) | 10 | 4 | ~40,000 concurrent |

### Proactive Scaling Schedule

If you have predictable traffic patterns:

```python
# Schedule-based scaling (pseudo-code)
# Implement as external service or Railway cron job

import schedule
from railway_api import scale_service

# Scale up during business hours
schedule.every().day.at("08:00").do(lambda: scale_service(6))

# Scale down at night
schedule.every().day.at("22:00").do(lambda: scale_service(2))

# Scale up for weekend traffic
schedule.every().saturday.at("10:00").do(lambda: scale_service(8))
schedule.every().sunday.at("22:00").do(lambda: scale_service(2))
```

## Monitoring and Alerts

### Set Up Alerts

1. **Railway Notifications:**
   - Project Settings → Notifications
   - Enable email/Slack alerts
   - Get notified on deployment failures

2. **External Monitoring (Recommended):**
   - **UptimeRobot:** Free uptime monitoring
   - **Datadog:** Comprehensive metrics (paid)
   - **New Relic:** APM and monitoring (paid)
   - **Sentry:** Error tracking (free tier available)

### Monitor Key Metrics

Watch these in Railway dashboard:

| Metric | Threshold | Action |
|--------|-----------|--------|
| **CPU Usage** | > 80% sustained | Consider adding replicas |
| **Memory Usage** | > 90% | Increase memory or add replicas |
| **Response Time** | > 1000ms average | Add replicas or optimize code |
| **Error Rate** | > 1% | Investigate errors, may need more capacity |
| **Request Rate** | Increasing trend | Plan for scaling |

## Summary

### ✅ What We Can Do on Railway

1. **Fixed Horizontal Scaling**
   - Set 2-10 replicas via `railway.toml`
   - Manual adjustment via dashboard
   - Load balancing automatic

2. **Resource Configuration**
   - Uvicorn workers per replica
   - Connection limits per replica
   - Database connection pooling

3. **Health-Based Management**
   - Auto-restart unhealthy replicas
   - Remove failed replicas from load balancer
   - Health check monitoring

4. **Load Testing**
   - Test capacity with provided scripts
   - Monitor performance during load
   - Identify bottlenecks

### ⚠️ Limitations

- No native CPU/memory-based auto-scaling
- No automatic scale-to-zero
- Manual intervention needed for traffic spikes
- Fixed cost per replica (no pay-per-request)

### 🎯 Recommended Approach

1. **Start with 2 replicas** (current configuration)
2. **Monitor traffic patterns** for 1-2 weeks
3. **Set appropriate fixed replica count** based on peak traffic
4. **Scale manually** during predictable traffic spikes
5. **Consider external monitoring** for advanced scenarios

Your application is **ready for horizontal scaling**, but Railway's auto-scaling is limited to fixed replica counts. Use the provided monitoring and testing tools to determine optimal replica configuration!

