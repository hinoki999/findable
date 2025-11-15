# Blue-Green Deployment Strategy for Railway

## Overview

Railway doesn't support traditional blue-green deployments with traffic splitting, but it provides **zero-downtime deployments** with health checks that achieve similar benefits. This guide documents Railway's deployment strategy and rollback procedures.

## Railway's Deployment Model

### How Railway Deploys (Zero-Downtime)

```
Current Version (Blue)
         ↓
    Health checks passing
         ↓
New Deployment Starts (Green)
         ↓
    Build new container
         ↓
    Start new container
         ↓
    Wait for health check (/health)
         ↓
    Health check passes?
         ↓
   YES → Switch traffic to Green
         ↓
    Gracefully shutdown Blue
         ↓
    Deployment Complete

   NO → Keep Blue running
        ↓
    Rollback automatically
```

### Key Features

✅ **Zero-downtime:** Old version stays running until new version is healthy  
✅ **Health check validation:** Traffic only switches after `/health` returns 200  
✅ **Automatic rollback:** Failed deployments don't affect traffic  
✅ **Quick rollback:** Can redeploy previous version in ~2 minutes  

## Configuration

### 1. Railway Health Check Configuration

Already configured in `railway.toml`:

```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**What this does:**
- Railway checks `/health` endpoint
- Waits up to 60 seconds for healthy response
- Only switches traffic after 200 OK
- Retries failed deployments up to 3 times

### 2. Multiple Replicas for High Availability

```toml
[deploy]
numReplicas = 2
```

**Rolling deployment with replicas:**
1. Deploy to Replica 1 (Green)
2. Wait for health check
3. Switch traffic to Replica 1
4. Deploy to Replica 2
5. Switch remaining traffic
6. Always have 1+ healthy replica

## Manual Blue-Green Strategy

For critical deployments where you want manual control:

### Option 1: Use Two Railway Services

Create two identical services in Railway:

```
Service Blue: droplink-blue (stable version)
Service Green: droplink-green (new version)
```

**Process:**

1. **Deploy to Green service**
2. **Test Green thoroughly**
3. **Update DNS/mobile app to point to Green**
4. **Keep Blue running for 24 hours** (quick rollback)
5. **Decommission Blue after verification**

**Cost:** 2x infrastructure during transition

### Option 2: Use Railway Environments (Staging → Production)

```
Staging Environment (Green)
         ↓
    Test new version
         ↓
    Merge to main
         ↓
Production Environment (Blue)
         ↓
    Auto-deploy with zero-downtime
```

**Cost:** Lower (only pay for staging when testing)

## Deployment Procedures

### Standard Deployment (Automatic Zero-Downtime)

**For Production:**

```bash
# 1. Merge tested code to main
git checkout main
git merge develop
git push origin main

# 2. Railway automatically:
# - Builds new version
# - Runs health checks
# - Switches traffic when healthy
# - Shuts down old version

# 3. Monitor deployment
# Go to Railway dashboard
# Watch logs for health check passes
# Verify deployment completes
```

**For Staging:**

```bash
# Push to develop branch
git checkout develop
git push origin develop

# Railway auto-deploys to staging
```

### High-Risk Deployment (Manual Verification)

For database migrations or major changes:

**Step 1: Deploy to Staging**

```bash
git checkout develop
git merge feature/major-change
git push origin develop

# Wait for staging deployment
# URL: https://droplink-staging.up.railway.app
```

**Step 2: Test Staging Thoroughly**

```powershell
cd backend
.\test-staging.ps1

# Manual testing:
# - Test all critical paths
# - Verify database migrations
# - Check for errors in logs
# - Load test if needed
```

**Step 3: Deploy to Production During Low Traffic**

```bash
# Choose low-traffic time (2-4 AM)
git checkout main
git merge develop
git push origin main
```

**Step 4: Monitor Production**

```powershell
# Real-time monitoring
$prod = "https://findable-production.up.railway.app"

while ($true) {
    $health = Invoke-RestMethod "$prod/health"
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - Status: $($health.status), DB: $($health.database)" -ForegroundColor Green
    Start-Sleep -Seconds 10
}
```

**Step 5: Verify or Rollback**

If issues detected:
```bash
# Immediate rollback
git revert HEAD
git push origin main
```

## Rollback Procedures

### Quick Rollback (2-3 minutes)

**Method 1: Railway Dashboard (Fastest)**

1. Go to Railway → Production service → Deployments
2. Find last known good deployment
3. Click "Redeploy"
4. Railway will redeploy that version in ~2 minutes

**Method 2: Git Revert**

```bash
# Find the bad commit
git log --oneline -10

# Revert it
git revert <bad-commit-hash>
git push origin main

# Railway auto-deploys the revert
```

**Method 3: Force Previous Version**

```bash
# Find last good commit
git log --oneline -10

# Reset to that commit
git checkout main
git reset --hard <good-commit-hash>
git push origin main --force

# ⚠️ Use with caution - rewrites history
```

### Emergency Rollback with Database Issues

If database migration failed:

**Step 1: Rollback Code**

```bash
# Revert to previous version (Railway dashboard is fastest)
```

**Step 2: Rollback Database**

```bash
# If you have a database backup:
# 1. Go to Railway → Postgres service
# 2. Stop writes if possible
# 3. Restore from backup

# If no backup:
# 1. Manually revert schema changes
# 2. Run migration rollback scripts
```

**Step 3: Verify**

```powershell
Invoke-RestMethod "https://findable-production.up.railway.app/health"
Invoke-RestMethod "https://findable-production.up.railway.app/ready"
```

## Deployment Validation

### Pre-Deployment Checklist

- [ ] All tests pass in staging
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] Rollback plan documented
- [ ] Team notified of deployment
- [ ] Low-traffic time window selected (if high-risk)

### Post-Deployment Validation

**Automated checks:**

```powershell
# Run validation script
cd backend
.\validate-deployment.ps1
```

**Manual checks:**

- [ ] Health endpoint returns 200
- [ ] Readiness check passes
- [ ] Can register new user
- [ ] Can login existing user
- [ ] Can update profile
- [ ] No errors in logs
- [ ] Response times normal
- [ ] Database queries working

### Monitoring During Deployment

**Watch these metrics in Railway:**

- **CPU usage:** Should stay under 80%
- **Memory usage:** Should stay under 90%
- **Response time:** Should stay under 500ms
- **Error rate:** Should stay under 1%

## Deployment Scripts

### validate-deployment.ps1

Tests critical endpoints after deployment:

```powershell
# validate-deployment.ps1
param(
    [string]$Url = "https://findable-production.up.railway.app",
    [string]$Environment = "production"
)

Write-Host "Validating $Environment Deployment" -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host ""

$allPassed = $true

# Test 1: Health Check
Write-Host "Test 1: Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "$Url/health" -TimeoutSec 10
    if ($health.status -eq "healthy" -and $health.database -eq "connected") {
        Write-Host "  ✓ PASSED" -ForegroundColor Green
    } else {
        Write-Host "  ✗ FAILED: Unhealthy" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# Test 2: Readiness Check
Write-Host "Test 2: Readiness Check..." -ForegroundColor Yellow
try {
    $ready = Invoke-RestMethod "$Url/ready" -TimeoutSec 10
    if ($ready.status -eq "ready") {
        Write-Host "  ✓ PASSED" -ForegroundColor Green
    } else {
        Write-Host "  ✗ FAILED: Not ready" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# Test 3: API Root
Write-Host "Test 3: API Root..." -ForegroundColor Yellow
try {
    $root = Invoke-RestMethod "$Url/" -TimeoutSec 10
    if ($root.status -eq "running") {
        Write-Host "  ✓ PASSED" -ForegroundColor Green
    } else {
        Write-Host "  ✗ FAILED" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# Test 4: Response Time
Write-Host "Test 4: Response Time..." -ForegroundColor Yellow
try {
    $start = Get-Date
    Invoke-RestMethod "$Url/health" -TimeoutSec 10 | Out-Null
    $duration = ((Get-Date) - $start).TotalMilliseconds
    
    if ($duration -lt 1000) {
        Write-Host "  ✓ PASSED ($([math]::Round($duration))ms)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ WARNING: Slow response ($([math]::Round($duration))ms)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ FAILED" -ForegroundColor Red
    $allPassed = $false
}

# Summary
Write-Host ""
if ($allPassed) {
    Write-Host "✓ All validation tests PASSED" -ForegroundColor Green
    Write-Host "Deployment is healthy!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Some validation tests FAILED" -ForegroundColor Red
    Write-Host "Consider rolling back!" -ForegroundColor Red
    exit 1
}
```

### monitor-deployment.ps1

Real-time monitoring during deployment:

```powershell
# monitor-deployment.ps1
param(
    [string]$Url = "https://findable-production.up.railway.app",
    [int]$DurationMinutes = 10
)

Write-Host "Monitoring Deployment" -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host "Duration: $DurationMinutes minutes" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

$endTime = (Get-Date).AddMinutes($DurationMinutes)
$errorCount = 0
$successCount = 0

while ((Get-Date) -lt $endTime) {
    try {
        $start = Get-Date
        $health = Invoke-RestMethod "$Url/health" -TimeoutSec 5
        $duration = ((Get-Date) - $start).TotalMilliseconds
        
        $status = $health.status
        $db = $health.database
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') | Status: $status | DB: $db | Time: $([math]::Round($duration))ms" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') | ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
        
        if ($errorCount -gt 5) {
            Write-Host "" -ForegroundColor Red
            Write-Host "⚠️  5+ consecutive errors detected!" -ForegroundColor Red
            Write-Host "Consider rolling back the deployment" -ForegroundColor Red
            break
        }
    }
    
    Start-Sleep -Seconds 5
}

Write-Host ""
Write-Host "Monitoring Summary:" -ForegroundColor Cyan
Write-Host "  Successful: $successCount" -ForegroundColor Green
Write-Host "  Errors: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "  Success Rate: $([math]::Round(($successCount / ($successCount + $errorCount)) * 100, 2))%" -ForegroundColor Gray
```

### rollback.ps1

Automated rollback script:

```powershell
# rollback.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$Environment,  # "staging" or "production"
    
    [Parameter(Mandatory=$true)]
    [string]$CommitHash  # Commit to rollback to
)

Write-Host "ROLLBACK PROCEDURE" -ForegroundColor Red
Write-Host "==================" -ForegroundColor Red
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Target Commit: $CommitHash" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Are you sure you want to rollback? (yes/no)"

if ($confirmation -ne "yes") {
    Write-Host "Rollback cancelled" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "Step 1: Reverting code..." -ForegroundColor Cyan

if ($Environment -eq "production") {
    git checkout main
    git reset --hard $CommitHash
    git push origin main --force
} elseif ($Environment -eq "staging") {
    git checkout develop
    git reset --hard $CommitHash
    git push origin develop --force
} else {
    Write-Host "Invalid environment: $Environment" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Code reverted" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Waiting for Railway deployment..." -ForegroundColor Cyan
Write-Host "Monitor at: https://railway.app" -ForegroundColor Gray

Start-Sleep -Seconds 120

Write-Host ""
Write-Host "Step 3: Validating rollback..." -ForegroundColor Cyan

if ($Environment -eq "production") {
    .\validate-deployment.ps1 -Url "https://findable-production.up.railway.app"
} else {
    .\validate-deployment.ps1 -Url "https://droplink-staging.up.railway.app"
}

Write-Host ""
Write-Host "✓ Rollback complete!" -ForegroundColor Green
```

## Best Practices

### 1. Always Test in Staging First

```
develop → Staging → Test → main → Production
```

Never skip staging!

### 2. Deploy During Low Traffic

**Best times:**
- **Weekdays:** 2-4 AM local time
- **Weekends:** Avoid (users may be active)
- **After hours:** Better than business hours

### 3. Monitor for 10+ Minutes

Don't assume deployment succeeded after 2 minutes. Monitor for at least 10 minutes.

### 4. Keep Rollback Plan Ready

Before every deployment, know:
- Last known good commit hash
- How to rollback quickly
- Who to notify if issues occur

### 5. Use Feature Flags for Big Changes

For major features:
```python
# In main.py
ENABLE_NEW_FEATURE = os.getenv("ENABLE_NEW_FEATURE", "false").lower() == "true"

@app.get("/new-feature")
def new_feature():
    if not ENABLE_NEW_FEATURE:
        raise HTTPException(404, "Not found")
    # ... new feature code
```

Deploy code, test with flag enabled, then enable for all users.

## Summary

Railway provides **zero-downtime deployments** that achieve most benefits of blue-green:

✅ **Old version stays running** until new version is healthy  
✅ **Health checks** validate before traffic switch  
✅ **Automatic rollback** on failed health checks  
✅ **Quick manual rollback** via Railway dashboard (2 min)  
✅ **Multiple replicas** for high availability  

**Limitations compared to true blue-green:**
❌ No gradual traffic shifting (0% → 100%)  
❌ No A/B testing capability  
❌ No manual traffic control  

**For most applications, Railway's approach is sufficient and simpler to manage!**

## Quick Reference

### Deployment Commands

```bash
# Deploy to staging
git checkout develop && git push

# Deploy to production
git checkout main && git merge develop && git push

# Quick rollback (Railway dashboard)
# Go to Deployments → Click previous deployment → Redeploy

# Git rollback
git revert HEAD && git push
```

### Validation Commands

```powershell
# Validate deployment
.\validate-deployment.ps1

# Monitor deployment
.\monitor-deployment.ps1 -DurationMinutes 10

# Compare environments
.\compare-environments.ps1
```

Your deployment strategy is production-ready! 🚀



