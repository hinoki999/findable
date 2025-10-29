# Database Backup and Restoration

## Overview

Comprehensive backup strategy for both local SQLite and Railway PostgreSQL databases with automated backups, retention policies, and documented restoration procedures.

---

## 1. Railway PostgreSQL Automatic Backups

### Configuration

Railway provides automatic database backups for PostgreSQL on Pro plans and above.

**Backup Schedule:**
- **Frequency:** Daily at 3:00 AM UTC
- **Retention:** 7 days (Railway default)
- **Type:** Full database dump

**To Enable in Railway Dashboard:**

1. Go to https://railway.app → Your Project
2. Click on PostgreSQL service
3. Go to "Settings" tab
4. Scroll to "Backups" section
5. Verify "Automatic Backups" is enabled
6. Set backup schedule to 3:00 AM UTC

**Backup Location:**
- Stored in Railway's backup infrastructure
- Accessible via Railway dashboard or CLI
- Encrypted at rest

---

## 2. Manual Backup Scripts

### For Local Development (SQLite)

**Script:** `backup-sqlite.py`

Backs up local SQLite database to cloud storage with timestamped filenames.

```python
# Usage:
python backup-sqlite.py

# With custom database path:
python backup-sqlite.py --db-path ./custom_database.db
```

**Features:**
- Exports SQLite to `.db` file
- Uploads to Cloudinary (using existing credentials)
- Includes timestamp in filename: `droplink-backup-YYYYMMDD-HHMMSS.db`
- Verifies backup integrity
- Logs backup status

### For Production (PostgreSQL on Railway)

**Script:** `backup-postgres.py`

Backs up Railway PostgreSQL database to cloud storage.

```python
# Usage:
python backup-postgres.py

# Environment variables required:
# - DATABASE_URL (Railway PostgreSQL connection string)
# - CLOUDINARY_CLOUD_NAME
# - CLOUDINARY_API_KEY
# - CLOUDINARY_API_SECRET
```

**Features:**
- Exports PostgreSQL using `pg_dump`
- Compresses backup with gzip
- Uploads to Cloudinary
- Includes timestamp: `droplink-postgres-backup-YYYYMMDD-HHMMSS.sql.gz`
- Verifies backup integrity

---

## 3. Retention Policy

### Policy Details

**Daily Backups:**
- Keep last 30 days
- Full database backups
- Stored in `backups/daily/` directory

**Weekly Backups:**
- Keep last 12 weeks (3 months)
- Taken every Sunday at 3:00 AM
- Stored in `backups/weekly/` directory

**Monthly Backups:**
- Keep last 12 months (1 year)
- Taken on 1st of each month at 3:00 AM
- Stored in `backups/monthly/` directory

### Retention Script

**Script:** `cleanup-old-backups.py`

Automatically removes old backups according to retention policy.

```python
# Usage:
python cleanup-old-backups.py

# Dry run (show what would be deleted):
python cleanup-old-backups.py --dry-run
```

**Cleanup Rules:**
- Daily: Delete backups older than 30 days
- Weekly: Delete backups older than 12 weeks
- Monthly: Delete backups older than 12 months
- Runs automatically after each backup
- Logs all deletions

---

## 4. Backup Restoration Process

### Restore SQLite Database (Local Development)

**Script:** `restore-sqlite.py`

```bash
# List available backups
python restore-sqlite.py --list

# Restore specific backup
python restore-sqlite.py --backup-id <backup-id>

# Restore latest backup
python restore-sqlite.py --latest
```

**Steps:**
1. Download backup from Cloudinary
2. Verify backup integrity (checksum)
3. Stop application if running
4. Backup current database (safety)
5. Restore database from backup file
6. Verify restoration
7. Restart application

### Restore PostgreSQL Database (Railway Production)

**Script:** `restore-postgres.py`

```bash
# List available backups
python restore-postgres.py --list

# Restore specific backup
python restore-postgres.py --backup-id <backup-id>

# Restore from Railway automatic backup
python restore-postgres.py --railway --date 2025-10-28
```

**Steps:**
1. Download backup (from Cloudinary or Railway)
2. Decompress if needed (gzip)
3. Connect to Railway PostgreSQL
4. Create safety snapshot (if possible)
5. Drop existing tables (with confirmation)
6. Restore from backup using `psql`
7. Verify restoration (check table counts, data)
8. Restart Railway service

**⚠️ IMPORTANT:** Production restoration requires:
- Confirmation prompt (type "RESTORE" to proceed)
- Maintenance mode (block user access)
- Team notification
- Post-restoration validation

---

## 5. Automated Backup Schedule

### Using GitHub Actions (Recommended)

**Workflow:** `.github/workflows/database-backup.yml`

Runs daily at 3:00 AM UTC:
- Backs up production PostgreSQL
- Uploads to Cloudinary
- Applies retention policy
- Sends notification on failure

### Using Railway Cron Job (Alternative)

**Limitation:** Railway doesn't support cron jobs on the same service.

**Workaround:**
1. Create separate "Backup Service" on Railway
2. Deploy backup script as standalone service
3. Use Railway's scheduler (Pro plan) or external cron service (cron-job.org)

### Manual Backup Trigger

```bash
# Backup SQLite (local)
python backend/backup-sqlite.py

# Backup PostgreSQL (production)
python backend/backup-postgres.py
```

---

## 6. Restoration Testing

### Test Procedure

**Frequency:** Monthly (1st Sunday of each month)

**Steps:**

1. **Select Test Backup:**
   ```bash
   python restore-postgres.py --list
   ```

2. **Create Test Environment:**
   - Use Railway staging environment
   - Never test on production

3. **Perform Restoration:**
   ```bash
   python restore-postgres.py --backup-id <test-backup> --target staging
   ```

4. **Validate Restoration:**
   ```bash
   python validate-backup.py --environment staging
   ```

5. **Verify Data Integrity:**
   - Check user count matches
   - Verify recent records exist
   - Test application functionality
   - Check for corruption

6. **Document Results:**
   - Record restoration time
   - Note any issues
   - Update procedures if needed

### Validation Script

**Script:** `validate-backup.py`

```bash
# Validate backup integrity before restoration
python validate-backup.py --backup-id <backup-id>

# Validate restored database
python validate-backup.py --environment staging
```

**Checks:**
- Table existence
- Row counts
- Data consistency
- Foreign key integrity
- Index integrity

---

## 7. Emergency Restoration Procedures

### Scenario 1: Data Corruption Detected

**Timeline:** Within 30 minutes

1. **Immediate Actions:**
   - Enable maintenance mode (block writes)
   - Notify team via Slack/Discord
   - Assess extent of corruption

2. **Identify Last Good Backup:**
   ```bash
   python restore-postgres.py --list
   # Select backup from before corruption
   ```

3. **Restore Database:**
   ```bash
   python restore-postgres.py --backup-id <backup-id>
   ```

4. **Validate and Resume:**
   - Run validation script
   - Test critical functionality
   - Disable maintenance mode
   - Monitor for issues

### Scenario 2: Accidental Data Deletion

**Timeline:** Within 15 minutes

1. **Stop Application:**
   - Prevent further changes
   - Railway dashboard → Stop service

2. **Restore from Backup:**
   ```bash
   # Find backup from before deletion
   python restore-postgres.py --list
   python restore-postgres.py --backup-id <backup-id>
   ```

3. **Verify Restoration:**
   - Check deleted data is restored
   - Validate related records

4. **Resume Service:**
   - Restart Railway service
   - Notify users if downtime > 5 minutes

### Scenario 3: Complete Database Loss

**Timeline:** Within 1 hour

1. **Assess Situation:**
   - Confirm database is unrecoverable
   - Check Railway automatic backups
   - Check Cloudinary manual backups

2. **Provision New Database:**
   - Railway dashboard → New PostgreSQL service
   - Update DATABASE_URL environment variable

3. **Restore Latest Backup:**
   ```bash
   python restore-postgres.py --latest
   ```

4. **Full Validation:**
   - Run comprehensive validation
   - Test all application features
   - Check data integrity
   - Verify user accounts

5. **Communication:**
   - Notify all users of potential data loss
   - Document incident
   - Update backup procedures

---

## 8. Backup Monitoring and Alerts

### Health Checks

**Script:** `check-backup-health.py`

Runs daily to verify backup system health.

**Checks:**
- Last backup timestamp (< 24 hours)
- Backup file integrity
- Storage space available
- Backup service status
- Retention policy compliance

### Alert Conditions

**Critical Alerts:**
- No backup in last 24 hours
- Backup failed 3 times consecutively
- Storage space < 10%
- Restoration test failed

**Warning Alerts:**
- Backup size increased > 50% (potential issue)
- Backup duration > 10 minutes
- Storage space < 25%

### Notification Channels

- **Email:** Send to admin email (via SendGrid)
- **Discord/Slack:** Post to #alerts channel
- **Railway Logs:** Log all backup events

---

## 9. Backup Security

### Encryption

**At Rest:**
- Cloudinary: Encrypted by default
- Railway: Encrypted by default
- Local backups: Use OS-level encryption

**In Transit:**
- HTTPS for all uploads/downloads
- TLS for PostgreSQL connections

### Access Control

**Cloudinary Backups:**
- API keys stored in environment variables
- Signed URLs with expiration (1 hour)
- IP whitelist for production backups

**Railway Backups:**
- Access via Railway CLI requires authentication
- Team members with "Admin" role only

### Backup Integrity

**Checksums:**
- Generate SHA-256 checksum for each backup
- Store checksum alongside backup
- Verify checksum before restoration

**Verification:**
```bash
# Verify backup integrity
python validate-backup.py --backup-id <backup-id> --verify-checksum
```

---

## 10. Cost Estimation

### Storage Costs

**Cloudinary (Free Tier):**
- 25 GB storage (free)
- Estimated backup size: 100 MB per backup
- 30 daily + 12 weekly + 12 monthly = 54 backups
- Total storage: ~5.4 GB
- **Cost:** $0/month (within free tier)

**Railway Backups:**
- Included with Pro plan
- 7-day retention
- **Cost:** Included

### Alternatives

**AWS S3:**
- ~$0.023/GB/month
- 5.4 GB = ~$0.12/month
- Lifecycle policies for automatic retention

**Google Cloud Storage:**
- ~$0.020/GB/month
- 5.4 GB = ~$0.11/month

---

## Quick Reference

### Backup Commands

```bash
# Backup local SQLite
python backend/backup-sqlite.py

# Backup production PostgreSQL
python backend/backup-postgres.py

# List available backups
python backend/restore-postgres.py --list

# Restore latest backup to staging
python backend/restore-postgres.py --latest --target staging

# Cleanup old backups
python backend/cleanup-old-backups.py

# Validate backup
python backend/validate-backup.py --backup-id <backup-id>

# Check backup health
python backend/check-backup-health.py
```

### Emergency Contacts

- **Database Issues:** Check Railway dashboard first
- **Backup Service:** Admin email
- **Railway Support:** https://railway.app/help

### Important Files

- **Backup Scripts:** `backend/backup-*.py`
- **Restore Scripts:** `backend/restore-*.py`
- **Validation:** `backend/validate-backup.py`
- **Documentation:** `backend/DATABASE_BACKUP.md`

---

## Next Steps

1. ✅ Configure Railway automatic backups
2. ✅ Create backup scripts (SQLite and PostgreSQL)
3. ✅ Implement retention policy
4. ✅ Document restoration procedures
5. ⏳ Implement automated GitHub Actions workflow
6. ⏳ Test restoration process
7. ⏳ Set up monitoring and alerts

---

**Document Version:** 1.0  
**Last Updated:** October 29, 2025  
**Next Review:** November 29, 2025

