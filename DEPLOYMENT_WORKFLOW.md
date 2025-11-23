# Droplink Deployment Workflow

## Quick Reference

### Branches

```
develop  →  Staging Environment
main     →  Production Environment
```

### Environments

| Environment | URL | Database | Auto-Deploy |
|-------------|-----|----------|-------------|
| **Staging** | https://droplink-staging.up.railway.app | PostgreSQL (staging) | ✅ On push to `develop` |
| **Production** | https://findable-production.up.railway.app | PostgreSQL (production) | ✅ On push to `main` |

## Development Workflow

```
┌─────────────────┐
│  Local Changes  │
└────────┬────────┘
         │
         ▼
  ┌──────────────┐
  │ Feature Branch│
  └──────┬───────┘
         │
         ▼
  ┌─────────────┐
  │ Pull Request│ ──► Code Review
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │   develop   │ ──► Auto-deploy to Staging
  └──────┬──────┘
         │
         ▼
    Test on Staging
         │
         ▼
  ┌─────────────┐
  │ Pull Request│ ──► Final Review
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │     main    │ ──► Auto-deploy to Production
  └─────────────┘
```

## Step-by-Step Guide

### 1. Start New Feature

```bash
# Ensure you're on develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/my-new-feature

# Make your changes
# ... code ...

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push to GitHub
git push origin feature/my-new-feature
```

### 2. Create Pull Request to Staging

1. Go to GitHub: https://github.com/hinoki999/findable
2. Click "New Pull Request"
3. Set base: `develop` ← compare: `feature/my-new-feature`
4. Fill in description
5. Request review
6. Wait for CI checks ✅
7. Get approval
8. Click "Merge"

### 3. Automatic Staging Deployment

**What happens automatically:**
1. ✅ PR merged to `develop`
2. ✅ GitHub Actions runs tests
3. ✅ Railway detects push to `develop`
4. ✅ Railway builds and deploys to staging
5. ✅ Health checks run
6. ✅ Deployment complete

**Check deployment:**
```bash
# Test staging health
curl https://droplink-staging.up.railway.app/health

# Or use PowerShell
Invoke-RestMethod "https://droplink-staging.up.railway.app/health"
```

### 4. Test on Staging

**Manual testing checklist:**
- [ ] Register new user
- [ ] Login with existing user
- [ ] Update profile
- [ ] Upload profile photo
- [ ] Create privacy zone
- [ ] Drop device/contact
- [ ] Test all new features
- [ ] Verify no regressions

**Automated testing:**
```powershell
cd backend
.\test-staging.ps1
```

### 5. Promote to Production

**After staging tests pass:**

```bash
# Switch to main
git checkout main
git pull origin main

# Merge develop into main
git merge develop

# Push to production
git push origin main
```

**Alternative (via Pull Request):**
1. Go to GitHub
2. Create PR: `develop` → `main`
3. Add description of changes
4. Get approval
5. Merge

### 6. Automatic Production Deployment

**What happens automatically:**
1. ✅ Push to `main`
2. ✅ GitHub Actions runs production tests
3. ✅ Railway detects push to `main`
4. ✅ Railway builds and deploys to production
5. ✅ Health checks run
6. ✅ Smoke tests run
7. ✅ Deployment complete

**Verify production:**
```bash
curl https://findable-production.up.railway.app/health
```

## Emergency Procedures

### Hotfix to Production

For critical bugs that need immediate fix:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-fix

# Fix the bug
# ... code ...

# Commit
git add .
git commit -m "fix: critical bug in authentication"

# Push directly to main (skip staging)
git checkout main
git merge hotfix/critical-bug-fix
git push origin main

# Backport to develop
git checkout develop
git merge main
git push origin develop
```

### Rollback Staging

```bash
# Option 1: Revert commit
git checkout develop
git revert <commit-hash>
git push origin develop

# Option 2: Use Railway dashboard
# 1. Go to staging service → Deployments
# 2. Find previous working deployment
# 3. Click "Redeploy"
```

### Rollback Production

```bash
# CRITICAL: Only for emergencies!

# Revert the bad commit
git checkout main
git revert <bad-commit-hash>
git push origin main

# Railway will auto-deploy the reverted version
```

## CI/CD Pipeline

### Staging Pipeline

```
┌─────────────────┐
│  Push to develop│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Run Linter    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Syntax Check   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Railway Deploy  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Health Check   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Smoke Tests    │
└─────────────────┘
```

### Production Pipeline

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Run Linter    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Syntax Check   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Production     │
│  Tests          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Railway Deploy  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Health Check   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Smoke Tests    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Verify Success │
└─────────────────┘
```

## Monitoring

### Check Environment Status

```powershell
# Compare both environments
cd backend
.\compare-environments.ps1
```

### Monitor Deployments

**Railway Dashboard:**
- Staging: https://railway.app → droplink-staging
- Production: https://railway.app → droplink-production

**GitHub Actions:**
- https://github.com/hinoki999/findable/actions

### View Logs

**Railway:**
1. Go to service → Deployments
2. Click on active deployment
3. View logs in real-time

**GitHub Actions:**
1. Go to Actions tab
2. Click on workflow run
3. View step-by-step logs

## Best Practices

### ✅ DO

- Always test on staging before production
- Write descriptive commit messages
- Keep develop and main in sync
- Monitor deployments
- Test rollback procedures
- Review code before merging
- Use feature branches
- Run automated tests

### ❌ DON'T

- Push directly to main (except hotfixes)
- Skip staging tests
- Deploy on Fridays (unless necessary)
- Ignore failed CI checks
- Force push to main
- Delete production data
- Test in production
- Deploy without review

## Troubleshooting

### Deployment Stuck

**Check:**
1. Railway dashboard for deployment status
2. GitHub Actions for CI/CD status
3. Logs for errors

**Fix:**
- Wait (deployments can take 2-3 minutes)
- Check for syntax errors in code
- Verify environment variables are set
- Manually redeploy in Railway

### Tests Failing

**Check:**
1. GitHub Actions logs
2. Railway deployment logs
3. Application logs

**Fix:**
- Fix the failing tests
- Ensure all dependencies are installed
- Check environment-specific issues
- Test locally first

### Environment Not Responding

**Check:**
1. Health endpoint: `/health`
2. Railway service status
3. Database connection

**Fix:**
- Check Railway dashboard for issues
- Verify environment variables
- Check database is running
- Redeploy if necessary

## Quick Commands

```bash
# Create develop branch (first time only)
git checkout -b develop
git push origin develop

# Start new feature
git checkout develop
git checkout -b feature/my-feature

# Deploy to staging
git checkout develop
git merge feature/my-feature
git push origin develop

# Deploy to production
git checkout main
git merge develop
git push origin main

# Check staging
curl https://droplink-staging.up.railway.app/health

# Check production
curl https://findable-production.up.railway.app/health

# Compare environments
cd backend
.\compare-environments.ps1

# Seed staging data
python seed_staging.py

# Test staging
.\test-staging.ps1
```

## Summary

✅ **Two environments:** Staging and Production  
✅ **Automatic deployments:** Push to deploy  
✅ **Separate databases:** Independent data  
✅ **CI/CD pipelines:** Automated testing  
✅ **Health checks:** Automatic monitoring  
✅ **Rollback procedures:** Quick recovery  

**Your deployment workflow is production-ready!** 🚀

For detailed setup instructions, see `backend/STAGING_SETUP.md`


