# Deployment Quick Reference

## 🚀 Standard Deployment

### Deploy to Staging

```bash
git checkout develop
git merge feature/your-feature
git push origin develop
```

Railway auto-deploys in ~2 minutes.

### Deploy to Production

```bash
# 1. Ensure staging is tested
# 2. Merge to main
git checkout main
git merge develop
git push origin main
```

Railway auto-deploys in ~2 minutes.

---

## ✅ Validate Deployment

```powershell
# Quick validation
cd backend
.\validate-deployment.ps1

# For staging
.\validate-deployment.ps1 -Url "https://findable-production-3e01.up.railway.app" -Environment "staging"

# For production
.\validate-deployment.ps1 -Url "https://findable-production.up.railway.app" -Environment "production"
```

---

## 📊 Monitor Deployment

```powershell
# Monitor for 10 minutes (default)
cd backend
.\monitor-deployment.ps1

# Custom duration
.\monitor-deployment.ps1 -DurationMinutes 15 -IntervalSeconds 10
```

---

## 🔄 Rollback

### Option 1: Railway Dashboard (FASTEST - 2 minutes)

1. Go to https://railway.app
2. Select your project
3. Click on service (Production or Staging)
4. Go to "Deployments" tab
5. Find last known good deployment
6. Click "..." → "Redeploy"

### Option 2: Automated Script

```powershell
# Find commit to rollback to
git log --oneline -20

# Run rollback script
cd backend
.\rollback.ps1 -Environment production -CommitHash abc1234
```

### Option 3: Git Revert (Safest)

```bash
# Revert the bad commit
git revert HEAD
git push origin main

# Railway auto-deploys the revert in ~2 minutes
```

---

## 🔍 Troubleshooting

### Deployment Failed

1. **Check Railway logs:**
   - Go to Railway dashboard
   - Click on service
   - View "Logs" tab
   - Look for startup errors

2. **Common issues:**
   - **Build failed:** Check `requirements.txt` syntax
   - **Import error:** Check for missing dependencies
   - **Port binding:** Railway sets `$PORT` automatically
   - **Database connection:** Verify `DATABASE_URL` is set to `${{Postgres.DATABASE_URL}}`

### Health Check Failing

```powershell
# Test health endpoint manually
Invoke-RestMethod "https://your-service.up.railway.app/health"

# Check database connectivity
Invoke-RestMethod "https://your-service.up.railway.app/ready"
```

**If health fails:**
- Database not connected
- Environment variables missing
- Application crash during startup

### Slow Response Times

```powershell
# Check response times
.\monitor-deployment.ps1 -DurationMinutes 5
```

**If slow (> 1000ms):**
- Scale up replicas in `railway.toml`
- Check database query performance
- Review Railway metrics for CPU/memory usage

---

## 📋 Pre-Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally
- [ ] Staging deployment successful
- [ ] Staging tests pass: `.\validate-deployment.ps1 -Url "STAGING_URL"`
- [ ] Database migrations tested (if any)
- [ ] Environment variables configured
- [ ] No breaking API changes (or mobile app updated)
- [ ] Rollback plan ready
- [ ] Team notified (for major changes)

---

## 🎯 Deployment Windows

### Low Risk (Anytime)
- Bug fixes
- UI improvements
- New optional features
- Documentation updates

### Medium Risk (Off-hours preferred)
- New API endpoints
- Database schema additions
- Performance optimizations

### High Risk (Scheduled maintenance window)
- Database migrations
- Breaking API changes
- Authentication changes
- Major refactors

**Recommended times:**
- Weekdays: 2-4 AM local time
- Avoid: Weekends, holidays, Friday afternoons

---

## 🛠️ Emergency Procedures

### Complete Service Outage

1. **Immediate rollback:**
   ```bash
   # Option 1: Railway dashboard (fastest)
   # Go to Deployments → Redeploy last good version
   
   # Option 2: Force rollback
   git reset --hard <last-good-commit>
   git push origin main --force
   ```

2. **Check database:**
   ```powershell
   # Verify database is accessible
   Invoke-RestMethod "https://your-service.up.railway.app/health"
   ```

3. **Notify users** (if outage > 5 minutes)

### Database Connection Lost

1. Check Railway Postgres service status
2. Verify `DATABASE_URL` environment variable
3. Check database connection limits
4. Restart database service if needed (Railway dashboard)

### Out of Memory / CPU Spike

1. **Immediate:** Scale up replicas in Railway dashboard
2. **Investigate:** Check logs for memory leaks or infinite loops
3. **Optimize:** Fix the code issue
4. **Deploy fix:** Through staging → production

---

## 📊 Post-Deployment

### Monitor for 15 Minutes

```powershell
.\monitor-deployment.ps1 -DurationMinutes 15
```

### Verify Critical Paths

- [ ] User can register
- [ ] User can login
- [ ] User can update profile
- [ ] Devices are detected
- [ ] Privacy zones work
- [ ] Photos upload (if changed)

### Check Metrics

**In Railway Dashboard:**
- CPU usage < 80%
- Memory usage < 90%
- No error spikes in logs
- Response times < 500ms

---

## 🔐 Environment Variables

### Production

```
JWT_SECRET_KEY=<256-bit-secret>
DATABASE_URL=${{Postgres.DATABASE_URL}}
SENDGRID_API_KEY=<your-key>
CLOUDINARY_CLOUD_NAME=<your-name>
CLOUDINARY_API_KEY=<your-key>
CLOUDINARY_API_SECRET=<your-secret>
```

### Staging

Same as production, but:
- Different `JWT_SECRET_KEY`
- Different `DATABASE_URL` (separate database)
- Optional: Use test SendGrid account

---

## 📞 Contact Info

**Railway Status:**
https://railway.statuspage.io

**Railway Support:**
https://discord.gg/railway

**Emergency Contacts:**
- Database issues: Check Postgres service logs
- Application issues: Check service logs
- Billing issues: Railway dashboard → Settings

---

## 🎓 Training Resources

**Railway Documentation:**
- https://docs.railway.app

**FastAPI Documentation:**
- https://fastapi.tiangolo.com

**PostgreSQL Documentation:**
- https://www.postgresql.org/docs

---

## 📝 Deployment Log Template

Keep a log of all production deployments:

```
Date: 2025-10-28
Time: 14:30 UTC
Branch: main
Commit: abc1234
Changes: Added password validation
Deployed by: [Your Name]
Validation: ✓ Passed
Issues: None
Rollback: Not needed
```

---

## Quick Command Reference

```powershell
# Deploy
git checkout main && git merge develop && git push origin main

# Validate
.\validate-deployment.ps1

# Monitor
.\monitor-deployment.ps1

# Rollback (Railway dashboard)
# Deployments → Previous deployment → Redeploy

# Rollback (script)
.\rollback.ps1 -Environment production -CommitHash abc1234

# Check health
Invoke-RestMethod "https://findable-production.up.railway.app/health"

# Check readiness
Invoke-RestMethod "https://findable-production.up.railway.app/ready"

# View logs
# Railway dashboard → Service → Logs

# Scale replicas
# Edit railway.toml → numReplicas = 4 → git push
```

---

**Remember:** When in doubt, ROLLBACK FIRST, investigate later! 🚨



