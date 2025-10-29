# Railway Automatic Backup Setup Guide

## Overview

Railway provides automatic PostgreSQL backups on Pro plans. This guide covers enabling and configuring these backups.

---

## Step 1: Verify Railway Plan

**Automatic backups are available on:**
- ✅ Pro Plan ($20/month)
- ✅ Team Plan (custom pricing)

**Not available on:**
- ❌ Hobby Plan (free tier)

**To check your plan:**
1. Go to https://railway.app
2. Click on your project
3. Go to Settings → Billing
4. Verify you're on Pro or Team plan

---

## Step 2: Enable Automatic Backups

### In Railway Dashboard

1. **Navigate to PostgreSQL service:**
   - Go to your Railway project
   - Click on the PostgreSQL service (database icon)

2. **Access Settings:**
   - Click the "Settings" tab at the top

3. **Enable Backups:**
   - Scroll down to "Backups" section
   - Toggle "Automatic Backups" to **ON**
   - Set schedule to **3:00 AM UTC** (daily)

4. **Save Settings:**
   - Changes are applied automatically
   - First backup will run at next scheduled time

---

## Step 3: Configure Backup Settings

### Backup Schedule

**Default:**
- Frequency: Daily
- Time: 3:00 AM UTC
- Retention: 7 days

**To customize:**
1. In PostgreSQL Settings → Backups
2. Click "Configure Schedule"
3. Set desired time and frequency

### Retention Policy

**Railway Default:**
- 7 daily backups (last 7 days)

**Extended retention (Pro/Team plans):**
- Contact Railway support to increase retention
- Or use manual backup script for longer retention

---

## Step 4: Verify Backups Are Running

### Check Backup Status

1. **In Railway Dashboard:**
   - PostgreSQL service → Settings → Backups
   - View "Recent Backups" list
   - Check timestamp of last backup

2. **Via Railway CLI:**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # List backups
   railway backups list
   ```

### Backup Logs

Check Railway service logs for backup activity:
1. PostgreSQL service → Deployments
2. View logs during backup window (3:00-3:30 AM UTC)
3. Look for backup success/failure messages

---

## Step 5: Test Backup Restoration

### Using Railway Dashboard

1. **Create test database:**
   - Add new PostgreSQL service to your project
   - Name it "test-restore-db"

2. **Restore backup to test database:**
   - Go to original PostgreSQL service → Settings → Backups
   - Find backup to test
   - Click "Restore" → Select test database
   - Confirm restoration

3. **Validate restoration:**
   - Connect to test database
   - Verify data integrity
   - Check table counts

4. **Clean up:**
   - Delete test database service after validation

### Using Railway CLI

```bash
# List available backups
railway backups list

# Restore specific backup to new database
railway backups restore <backup-id> --new-database test-restore

# Verify restoration
railway run --database test-restore psql -c "SELECT COUNT(*) FROM users;"

# Clean up
railway database delete test-restore
```

---

## Step 6: Set Up Monitoring

### Railway Notifications

**Enable backup notifications:**
1. Railway Dashboard → Project Settings
2. Go to "Notifications" tab
3. Add notification channel (email/Slack/Discord)
4. Enable "Backup failures" alerts

### Custom Monitoring

Add to your GitHub Actions workflow:

```yaml
name: Check Railway Backups

on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC daily

jobs:
  check-backups:
    runs-on: ubuntu-latest
    steps:
      - name: Check last backup
        run: |
          # Use Railway API to check last backup timestamp
          # Send alert if no backup in last 24 hours
```

---

## Step 7: Document Access Procedures

### Who Can Access Backups

**Railway Dashboard:**
- Project owners (full access)
- Team members with "Admin" role

**Railway CLI:**
- Anyone with project access token
- Team members who have logged in

### Access Control

**Best practices:**
1. Limit Railway admin access to 2-3 people
2. Use Railway CLI tokens with appropriate permissions
3. Rotate access tokens quarterly
4. Log all backup restorations

---

## Backup Comparison: Railway vs Manual

### Railway Automatic Backups

**Pros:**
- ✅ Automatic (no maintenance)
- ✅ Integrated with Railway dashboard
- ✅ Fast restoration (via UI or CLI)
- ✅ Encrypted at rest and in transit
- ✅ No external dependencies

**Cons:**
- ❌ Limited retention (7 days default)
- ❌ Requires Pro plan ($20/month)
- ❌ No custom retention policies
- ❌ Tied to Railway infrastructure

### Manual Backups (Cloudinary + GitHub Actions)

**Pros:**
- ✅ Longer retention (30/90/365 days)
- ✅ Works on any plan (including Hobby)
- ✅ Multiple storage options (Cloudinary/S3/GCS)
- ✅ Portable (not tied to Railway)
- ✅ Customizable retention policies

**Cons:**
- ❌ Requires setup and maintenance
- ❌ Depends on external services (GitHub Actions, Cloudinary)
- ❌ Slightly slower restoration process
- ❌ More complex (multiple tools)

### Recommended Strategy

**Use both for maximum protection:**

1. **Railway automatic backups (primary):**
   - For quick recovery from recent issues
   - Daily backups with 7-day retention
   - Fast restoration via Railway dashboard

2. **Manual backups to Cloudinary (secondary):**
   - For long-term retention (30/90/365 days)
   - Disaster recovery if Railway fails
   - Compliance and audit requirements

---

## Troubleshooting

### Backups Not Running

**Check:**
1. Railway plan includes automatic backups
2. Backups are enabled in settings
3. Schedule is set correctly
4. PostgreSQL service is running

**Solution:**
- Verify Pro/Team plan subscription
- Re-enable backups in settings
- Check Railway status page for outages

### Restoration Failed

**Common causes:**
1. Insufficient disk space on target database
2. Database version mismatch
3. Connection timeout during restoration
4. Corrupted backup file

**Solutions:**
- Scale up database storage
- Use same PostgreSQL version
- Increase timeout in Railway settings
- Try restoring an earlier backup

### Backup Size Too Large

**Issue:** Backups taking too long or consuming too much storage

**Solutions:**
1. Archive old data (move to separate archive database)
2. Clean up unused tables/indexes
3. Compress data (use PostgreSQL compression features)
4. Consider database sharding

---

## Quick Reference Commands

```bash
# Railway CLI backup commands
railway backups list                    # List all backups
railway backups create                  # Create manual backup
railway backups restore <id>            # Restore backup
railway backups delete <id>             # Delete backup

# Manual backup commands
python backend/backup-postgres.py       # Create manual backup
python backend/restore-postgres.py --list   # List Cloudinary backups
python backend/restore-postgres.py --latest # Restore latest backup
python backend/cleanup-old-backups.py   # Clean up old backups
```

---

## Support

**Railway Support:**
- Dashboard: Help button (bottom right)
- Discord: https://discord.gg/railway
- Email: team@railway.app
- Docs: https://docs.railway.app

**For Backup Issues:**
1. Check Railway status: https://railway.statuspage.io
2. Review service logs for errors
3. Contact Railway support with backup ID

---

**Last Updated:** October 29, 2025  
**Next Review:** November 29, 2025

