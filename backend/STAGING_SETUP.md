# Staging Environment Setup Guide

## Overview

This guide covers setting up a complete staging environment for Droplink with separate Railway projects, databases, and automated deployments.

## Architecture

```
Development Workflow:
  develop branch → Staging Environment (auto-deploy)
       ↓
  Pull Request → Code Review
       ↓
  main branch → Production Environment (auto-deploy)
```

## Environment Structure

| Environment | Branch | Railway Project | Database | Purpose |
|-------------|--------|----------------|----------|---------|
| **Development** | `develop` | droplink-staging | PostgreSQL (staging) | Testing new features |
| **Staging** | `develop` | droplink-staging | PostgreSQL (staging) | Pre-production testing |
| **Production** | `main` or `albert/full-integration` | droplink-production | PostgreSQL (production) | Live user traffic |

## Step 1: Create Staging Railway Project

### 1.1 Create New Project in Railway

1. **Go to Railway:** https://railway.app
2. **Click "New Project"**
3. **Name it:** `droplink-staging`
4. **Select "Deploy from GitHub repo"**
5. **Choose:** `hinoki999/findable` repository
6. **Select branch:** `develop` (create this branch first if it doesn't exist)

### 1.2 Add PostgreSQL Database

1. **In the staging project, click "New"**
2. **Select "Database" → "PostgreSQL"**
3. **Railway will create a new PostgreSQL instance**
4. **This database is completely separate from production**

### 1.3 Connect Backend to Database

1. **Click on the backend service**
2. **Go to "Variables" tab**
3. **Add variable:**
   ```
   Name: DATABASE_URL
   Value: ${{Postgres.DATABASE_URL}}
   ```
4. **Railway will automatically populate this**

## Step 2: Configure Staging Environment Variables

### 2.1 Generate Staging JWT Secret

**On your local machine:**

```powershell
# Generate a unique JWT secret for staging
cd C:\Users\caiti\Documents\droplin\backend
python generate_secret_key.py
```

**Copy the output** - this will be your staging JWT secret (different from production)

### 2.2 Set Staging Variables in Railway

**In Railway → droplink-staging → backend service → Variables:**

```env
# Core Configuration
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET_KEY=<your-staging-secret-from-step-2.1>
JWT_ALGORITHM=HS256
JWT_KEY_VERSION=1
ACCESS_TOKEN_EXPIRE_DAYS=30
ACTIVITY_TIMEOUT_MINUTES=30
REMEMBER_ME_TIMEOUT_DAYS=30

# Cloudinary (can share with production or use separate account)
CLOUDINARY_CLOUD_NAME=your-staging-cloud-name
CLOUDINARY_API_KEY=your-staging-api-key
CLOUDINARY_API_SECRET=your-staging-api-secret

# SendGrid (can share with production or use separate account)
SENDGRID_API_KEY=your-sendgrid-key
FROM_EMAIL=noreply-staging@yourdomain.com

# Environment Identifier
ENVIRONMENT=staging
```

### 2.3 Important: Different Secrets

**Why different JWT secrets?**
- ✅ Prevents production tokens from working in staging
- ✅ Prevents staging tokens from working in production
- ✅ Isolates security between environments

## Step 3: Create Develop Branch

### 3.1 Create and Push Develop Branch

```powershell
cd C:\Users\caiti\Documents\droplin

# Create develop branch from current branch
git checkout -b develop

# Push to GitHub
git push origin develop
```

### 3.2 Set Develop as Default for Staging

**In Railway → droplink-staging → backend service:**
1. Go to "Settings" tab
2. Scroll to "Source" section
3. Set "Branch" to: `develop`
4. Click "Save"

## Step 4: Set Up CI/CD with GitHub Actions

### 4.1 Create GitHub Actions Workflow

Create `.github/workflows/staging-deploy.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches:
      - develop
  pull_request:
    branches:
      - develop

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      
      - name: Run linter
        run: |
          cd backend
          pip install flake8
          flake8 main.py --max-line-length=120 --ignore=E501,W503
      
      - name: Run tests (if you have tests)
        run: |
          cd backend
          # python -m pytest tests/
          echo "Add tests here"
  
  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Deploy to Railway (Staging)
        run: |
          echo "Railway will auto-deploy on push to develop branch"
          echo "Check Railway dashboard for deployment status"
      
      - name: Wait for deployment
        run: sleep 60
      
      - name: Health check staging
        run: |
          # Replace with your staging URL
          STAGING_URL="https://droplink-staging.up.railway.app"
          
          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/health")
            if [ "$STATUS" = "200" ]; then
              echo "✓ Staging deployment successful!"
              exit 0
            fi
            echo "Waiting for staging deployment... ($i/10)"
            sleep 10
          done
          
          echo "✗ Staging deployment failed or timed out"
          exit 1
      
      - name: Run smoke tests
        run: |
          STAGING_URL="https://droplink-staging.up.railway.app"
          
          # Test health endpoint
          curl -f "$STAGING_URL/health" || exit 1
          
          # Test readiness endpoint
          curl -f "$STAGING_URL/ready" || exit 1
          
          echo "✓ Smoke tests passed"
```

### 4.2 Create Production Deploy Workflow

Create `.github/workflows/production-deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main
      - albert/full-integration
  workflow_dispatch: # Allows manual trigger

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      
      - name: Run linter
        run: |
          cd backend
          pip install flake8
          flake8 main.py --max-line-length=120 --ignore=E501,W503
      
      - name: Run tests
        run: |
          cd backend
          # python -m pytest tests/
          echo "Add production tests here"
  
  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/albert/full-integration'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Deploy to Railway (Production)
        run: |
          echo "Railway will auto-deploy on push to main/albert/full-integration"
          echo "Check Railway dashboard for deployment status"
      
      - name: Wait for deployment
        run: sleep 90
      
      - name: Health check production
        run: |
          PROD_URL="https://findable-production.up.railway.app"
          
          for i in {1..15}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/health")
            if [ "$STATUS" = "200" ]; then
              echo "✓ Production deployment successful!"
              exit 0
            fi
            echo "Waiting for production deployment... ($i/15)"
            sleep 10
          done
          
          echo "✗ Production deployment failed or timed out"
          exit 1
      
      - name: Run production smoke tests
        run: |
          PROD_URL="https://findable-production.up.railway.app"
          
          # Test critical endpoints
          curl -f "$PROD_URL/health" || exit 1
          curl -f "$PROD_URL/ready" || exit 1
          curl -f "$PROD_URL/" || exit 1
          
          echo "✓ Production smoke tests passed"
      
      - name: Notify on success
        if: success()
        run: |
          echo "✓ Production deployment successful!"
          # Add Slack/email notification here if desired
      
      - name: Notify on failure
        if: failure()
        run: |
          echo "✗ Production deployment failed!"
          # Add Slack/email notification here if desired
```

## Step 5: Deployment Workflow

### 5.1 Development Workflow

```bash
# 1. Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/new-feature

# 2. Make changes
# ... code changes ...

# 3. Commit changes
git add .
git commit -m "Add new feature"

# 4. Push to GitHub
git push origin feature/new-feature

# 5. Create Pull Request to develop branch
# - Go to GitHub
# - Create PR: feature/new-feature → develop
# - Request code review
# - Wait for CI checks to pass
```

### 5.2 Staging Deployment (Automatic)

```bash
# After PR is approved and merged to develop:

# 1. Merge happens on GitHub
# 2. GitHub Actions runs tests
# 3. Railway auto-deploys to staging
# 4. Staging URL: https://droplink-staging.up.railway.app

# 5. Test on staging:
curl https://droplink-staging.up.railway.app/health
curl https://droplink-staging.up.railway.app/ready

# 6. Manual testing:
# - Test all new features
# - Verify database migrations
# - Check API endpoints
# - Test mobile app against staging
```

### 5.3 Production Deployment

```bash
# After staging testing is complete:

# 1. Create PR from develop to main
git checkout develop
git pull origin develop
git checkout main
git pull origin main
git merge develop

# 2. Push to main
git push origin main

# 3. GitHub Actions runs production tests
# 4. Railway auto-deploys to production
# 5. Production URL: https://findable-production.up.railway.app

# 6. Verify production deployment:
curl https://findable-production.up.railway.app/health
```

## Step 6: Environment URLs

### 6.1 Configure URLs

Update `mobile/src/config/environment.ts`:

```typescript
export type Environment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  BASE_URL: string;
  NAME: string;
  ENFORCE_HTTPS: boolean;
}

const ENV_CONFIG: Record<Environment, EnvironmentConfig> = {
  development: {
    BASE_URL: 'http://192.168.1.92:8081',
    NAME: 'Development',
    ENFORCE_HTTPS: false,
  },
  staging: {
    BASE_URL: 'https://droplink-staging.up.railway.app',
    NAME: 'Staging',
    ENFORCE_HTTPS: true,
  },
  production: {
    BASE_URL: 'https://findable-production.up.railway.app',
    NAME: 'Production',
    ENFORCE_HTTPS: true,
  },
};

// Change this to switch environments
const CURRENT_ENV: Environment = 'production';

export const ENV = ENV_CONFIG[CURRENT_ENV];

console.log(`📱 Environment: ${ENV.NAME} (${ENV.BASE_URL})`);
```

## Step 7: Database Management

### 7.1 Staging Database

**Railway automatically provides:**
- Separate PostgreSQL instance for staging
- Independent data from production
- Same schema (initialized by `init_db()`)

**To clear staging data:**

```bash
# Call admin endpoint (staging)
curl -X DELETE https://droplink-staging.up.railway.app/admin/clear-all-data \
  -H "secret: delete-all-profiles-2024"
```

### 7.2 Database Migrations

**When schema changes:**

1. **Update `init_db()` in `main.py`**
2. **Commit to develop branch**
3. **Deploy to staging** (auto)
4. **Verify schema changes work**
5. **Merge to main** (after testing)
6. **Deploy to production** (auto)

### 7.3 Data Seeding

Create `backend/seed_staging.py` for test data:

```python
# seed_staging.py
import requests

STAGING_URL = "https://droplink-staging.up.railway.app"

def seed_test_users():
    """Create test users in staging"""
    users = [
        {"username": "testuser1", "password": "Test1234!", "email": "test1@example.com"},
        {"username": "testuser2", "password": "Test1234!", "email": "test2@example.com"},
        {"username": "testuser3", "password": "Test1234!", "email": "test3@example.com"},
    ]
    
    for user in users:
        try:
            response = requests.post(f"{STAGING_URL}/auth/register", json=user)
            if response.status_code == 200:
                print(f"✓ Created user: {user['username']}")
            else:
                print(f"✗ Failed to create {user['username']}: {response.text}")
        except Exception as e:
            print(f"✗ Error: {e}")

if __name__ == "__main__":
    print("Seeding staging database...")
    seed_test_users()
    print("Done!")
```

**Run seeding:**
```powershell
cd backend
python seed_staging.py
```

## Step 8: Testing Strategy

### 8.1 Staging Tests

**Before promoting to production:**

- ✅ Register new user
- ✅ Login with existing user
- ✅ Update profile
- ✅ Upload profile photo
- ✅ Create privacy zone
- ✅ Drop device/contact
- ✅ Verify email/SMS flows
- ✅ Test JWT token refresh
- ✅ Test account lockout
- ✅ Test audit logging

### 8.2 Automated Staging Tests

Create `backend/test-staging.ps1`:

```powershell
# test-staging.ps1
$STAGING_URL = "https://droplink-staging.up.railway.app"

Write-Host "Testing Staging Environment" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`nTest 1: Health Check" -ForegroundColor Yellow
$health = Invoke-RestMethod "$STAGING_URL/health"
if ($health.status -eq "healthy") {
    Write-Host "  ✓ Health check passed" -ForegroundColor Green
} else {
    Write-Host "  ✗ Health check failed" -ForegroundColor Red
    exit 1
}

# Test 2: Readiness Check
Write-Host "`nTest 2: Readiness Check" -ForegroundColor Yellow
$ready = Invoke-RestMethod "$STAGING_URL/ready"
if ($ready.status -eq "ready") {
    Write-Host "  ✓ Readiness check passed" -ForegroundColor Green
} else {
    Write-Host "  ✗ Readiness check failed" -ForegroundColor Red
    exit 1
}

# Test 3: Register User
Write-Host "`nTest 3: User Registration" -ForegroundColor Yellow
try {
    $timestamp = (Get-Date).ToString("yyyyMMddHHmmss")
    $testUser = @{
        username = "testuser_$timestamp"
        password = "Test1234!"
        email = "test_${timestamp}@example.com"
    }
    
    $response = Invoke-RestMethod -Uri "$STAGING_URL/auth/register" -Method POST -ContentType "application/json" -Body ($testUser | ConvertTo-Json)
    Write-Host "  ✓ User registration successful" -ForegroundColor Green
    $token = $response.token
} catch {
    Write-Host "  ✗ User registration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 4: Protected Endpoint
Write-Host "`nTest 4: Protected Endpoint (JWT)" -ForegroundColor Yellow
try {
    $headers = @{"Authorization" = "Bearer $token"}
    $profile = Invoke-RestMethod -Uri "$STAGING_URL/user/profile" -Headers $headers
    Write-Host "  ✓ JWT authentication working" -ForegroundColor Green
} catch {
    Write-Host "  ✗ JWT authentication failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ All staging tests passed!" -ForegroundColor Green
```

## Step 9: Rollback Procedure

### 9.1 Rollback Staging

**If staging deployment breaks:**

```bash
# Option 1: Revert the commit
git revert <commit-hash>
git push origin develop

# Option 2: Deploy previous commit
# In Railway dashboard:
# 1. Go to Deployments
# 2. Find previous working deployment
# 3. Click "Redeploy"
```

### 9.2 Rollback Production

**If production deployment breaks:**

```bash
# Option 1: Revert and push
git checkout main
git revert <bad-commit-hash>
git push origin main

# Option 2: Use Railway dashboard
# 1. Go to production service → Deployments
# 2. Find last known good deployment
# 3. Click "Redeploy"

# Option 3: Emergency rollback
git checkout main
git reset --hard <good-commit-hash>
git push origin main --force  # ⚠️ Use with caution!
```

## Step 10: Monitoring Both Environments

### 10.1 Set Up Separate Monitoring

**UptimeRobot (Free tier):**

```
Monitor 1: Staging Health
- URL: https://droplink-staging.up.railway.app/health
- Interval: 5 minutes
- Alert: Email

Monitor 2: Production Health  
- URL: https://findable-production.up.railway.app/health
- Interval: 1 minute
- Alert: Email + SMS
```

### 10.2 Dashboard Comparison

Create `backend/compare-environments.ps1`:

```powershell
# compare-environments.ps1
$staging = "https://droplink-staging.up.railway.app"
$production = "https://findable-production.up.railway.app"

Write-Host "Environment Comparison" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

# Compare health
$stagingHealth = Invoke-RestMethod "$staging/health"
$productionHealth = Invoke-RestMethod "$production/health"

Write-Host "`nStaging:" -ForegroundColor Yellow
Write-Host "  Status: $($stagingHealth.status)" -ForegroundColor Gray
Write-Host "  Database: $($stagingHealth.database)" -ForegroundColor Gray
Write-Host "  Version: $($stagingHealth.version)" -ForegroundColor Gray

Write-Host "`nProduction:" -ForegroundColor Yellow
Write-Host "  Status: $($productionHealth.status)" -ForegroundColor Gray
Write-Host "  Database: $($productionHealth.database)" -ForegroundColor Gray
Write-Host "  Version: $($productionHealth.version)" -ForegroundColor Gray
```

## Summary Checklist

### ✅ Initial Setup

- [ ] Create `develop` branch
- [ ] Create Railway staging project
- [ ] Add PostgreSQL to staging
- [ ] Configure staging environment variables
- [ ] Generate unique JWT secret for staging
- [ ] Connect staging to `develop` branch

### ✅ CI/CD Setup

- [ ] Create `.github/workflows/staging-deploy.yml`
- [ ] Create `.github/workflows/production-deploy.yml`
- [ ] Test staging auto-deploy
- [ ] Test production auto-deploy

### ✅ Mobile App Setup

- [ ] Add staging environment to `environment.ts`
- [ ] Test mobile app against staging
- [ ] Test mobile app against production

### ✅ Testing Setup

- [ ] Create staging test script
- [ ] Seed staging with test data
- [ ] Document testing procedures
- [ ] Create rollback procedures

### ✅ Monitoring

- [ ] Set up staging health monitoring
- [ ] Set up production health monitoring
- [ ] Configure alerts for both environments

## Quick Reference

### Commands

```bash
# Switch to develop
git checkout develop

# Create feature branch
git checkout -b feature/my-feature

# Push to staging (via develop)
git push origin develop

# Promote to production (via main)
git checkout main
git merge develop
git push origin main

# Test staging
curl https://droplink-staging.up.railway.app/health

# Test production
curl https://findable-production.up.railway.app/health
```

### URLs

- **Staging:** https://droplink-staging.up.railway.app
- **Production:** https://findable-production.up.railway.app
- **Railway:** https://railway.app
- **GitHub Actions:** https://github.com/hinoki999/findable/actions

Your staging environment is ready for a professional development workflow! 🚀


