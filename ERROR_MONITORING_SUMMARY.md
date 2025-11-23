# Error Monitoring System - Complete Summary

Comprehensive error monitoring system for DropLink that catches all errors, performance issues, and system failures.

## 📁 Files Created

### Backend (Python/FastAPI)

**`backend/error_logging.py`**
- Error collection endpoints for FastAPI
- Pydantic models for validation
- Database schema SQL
- Three endpoints: `/api/log-error`, `/api/log-performance`, `/api/log-ble-error`
- Query endpoints for dashboard access

### Mobile App (TypeScript/React Native)

**`mobile/src/utils/ErrorLogger.ts`**
- Global error boundary component
- Catches all JavaScript errors in the app
- Logs to backend with device info, stack traces, screen names
- `useErrorLogger` hook for manual error logging
- Fails silently if logging fails

**`mobile/src/utils/PerformanceLogger.ts`**
- Track screen load times
- Track API request durations
- Track photo upload times
- Track BLE scan duration
- Detects slow operations (>3s)
- `usePerformanceLogger` hook
- Fails silently if logging fails

**`mobile/src/utils/BLEErrorLogger.ts`**
- BLE-specific error logging
- Tracks initialization, scan, connection, permission errors
- Groups errors by type and device
- `useBLEErrorLogger` hook
- Fails silently if logging fails

### Monitoring Scripts (Python)

**`monitoring/monitor-railway-logs.py`**
- Monitors Railway backend health
- Checks backend every 60 seconds
- Creates GitHub issues for downtime
- Attempts to stream logs via Railway CLI

**`monitoring/monitor-database-health.py`**
- Tests PostgreSQL connectivity every 60 seconds
- Verifies all required tables exist
- Checks database size
- Creates GitHub issues for database failures

**`monitoring/monitor-api-health.py`**
- Hits critical endpoints every 2 minutes
- Tests: login, register, profile, devices
- Creates GitHub issues for failures
- Alerts on slow responses (>5s)
- Maintains test account automatically

**`monitoring/monitor-user-errors.py`**
- Queries `errors` table every 60 seconds
- Groups errors by message and screen
- Creates GitHub issues for crashes
- Tracks affected users and devices

**`monitoring/monitor-performance.py`**
- Queries `performance_metrics` table every 5 minutes
- Identifies slow operations (>5s)
- Tracks performance degradation trends
- Alerts when operations get 50% slower

**`monitoring/monitor-ble-health.py`**
- Queries `ble_errors` table every 3 minutes
- Groups by error type, platform, device
- Identifies device-specific issues
- Alerts on widespread BLE failures

**`monitoring/requirements.txt`**
- Python dependencies:
  - requests
  - PyGithub
  - psycopg2-binary

### GitHub Actions

**`.github/workflows/error-monitoring.yml`**
- Runs all 6 monitors every 5 minutes
- Parallel execution for efficiency
- 10-minute timeout per job
- Uses GitHub secrets for credentials
- Manual trigger available

### Documentation

**`monitoring/README.md`**
- Complete system documentation
- Architecture diagram
- Setup instructions
- Usage examples
- Troubleshooting guide
- Maintenance procedures

**`INTEGRATION_GUIDE.md`**
- Step-by-step integration instructions
- Code examples for each step
- Backend setup
- Frontend integration
- GitHub secrets configuration
- Testing procedures

**`ERROR_MONITORING_SUMMARY.md`** (this file)
- Complete file listing
- What each file does
- System capabilities
- Setup checklist

## 🎯 What Gets Monitored

### Backend Monitoring
✅ Server health (up/down status)
✅ API endpoint availability
✅ API response times
✅ Database connectivity
✅ Table integrity
✅ 500 errors and exceptions

### User-Side Monitoring
✅ JavaScript errors and crashes
✅ React component errors
✅ Screen load times
✅ API call durations
✅ Photo upload performance
✅ BLE scan duration
✅ BLE initialization failures
✅ BLE permission denials
✅ Device-specific issues

### Alerts Created
✅ Backend down
✅ Database unreachable
✅ API endpoints failing
✅ Slow API responses (>5s)
✅ User app crashes
✅ Performance degradation
✅ Slow operations
✅ Widespread BLE failures
✅ Device-specific BLE issues

## 📊 Database Schema

Three new tables added:

### `errors` table
- `id` - Serial primary key
- `timestamp` - When error occurred
- `user_id` - User who experienced error
- `error_message` - Error message
- `stack_trace` - Full stack trace
- `screen_name` - Screen where error occurred
- `device_info` - JSON: platform, OS, device model
- `additional_data` - JSON: custom data
- Indexes on: timestamp, user_id, screen_name

### `performance_metrics` table
- `id` - Serial primary key
- `timestamp` - When metric was recorded
- `user_id` - User performing operation
- `metric_name` - Operation name (e.g., "api_getUserProfile")
- `duration_ms` - Duration in milliseconds
- `screen_name` - Screen where operation occurred
- `additional_data` - JSON: custom data
- Indexes on: timestamp, user_id, metric_name, slow operations (>5s)

### `ble_errors` table
- `id` - Serial primary key
- `timestamp` - When error occurred
- `user_id` - User experiencing BLE issue
- `error_type` - Type: initialization, scan, connection, permission, unknown
- `error_message` - Error message
- `device_info` - JSON: platform, OS, device model
- `additional_data` - JSON: custom data
- Indexes on: timestamp, user_id, error_type

## 🔧 Setup Checklist

### 1. Backend Setup
- [ ] Copy `backend/error_logging.py` to backend folder
- [ ] Add import to `main.py`: `from error_logging import router as error_logging_router`
- [ ] Include router: `app.include_router(error_logging_router)`
- [ ] Run database schema SQL (create 3 tables with indexes)
- [ ] Deploy to Railway: `git push origin develop`
- [ ] Verify tables exist: `railway connect postgres`

### 2. Mobile App Setup
- [ ] Copy 3 logger files to `mobile/src/utils/`
- [ ] Wrap App.tsx with `<ErrorBoundary>`
- [ ] Set user IDs in App.tsx useEffect
- [ ] Add screen tracking to all screens
- [ ] Wrap API calls with performance tracking
- [ ] Add BLE error logging to BLE code
- [ ] Track photo uploads
- [ ] Deploy: `npx eas update --branch preview --message "Add error monitoring"`

### 3. Monitoring Setup
- [ ] Copy monitoring folder to project root
- [ ] Copy `.github/workflows/error-monitoring.yml`
- [ ] Add GitHub secrets:
  - [ ] DATABASE_URL
  - [ ] MONITOR_TEST_USERNAME
  - [ ] MONITOR_TEST_PASSWORD
  - [ ] MONITOR_TEST_EMAIL
- [ ] Push to GitHub: `git push origin develop`
- [ ] Verify workflow runs: Check Actions tab

### 4. Testing
- [ ] Cause an error in app → Check errors table
- [ ] Navigate screens → Check performance_metrics table
- [ ] Use BLE → Check ble_errors table
- [ ] Manually run workflow → Check for issues created
- [ ] Query error data via Railway CLI
- [ ] Test API endpoints: `/api/errors/recent`, `/api/performance/slow`

## 📈 Monitoring Workflow

```
Every 5 minutes (GitHub Actions):
├── monitor-railway-logs.py (backend health)
├── monitor-database-health.py (database connectivity)
├── monitor-api-health.py (API endpoints)
├── monitor-user-errors.py (user crashes)
├── monitor-performance.py (slow operations)
└── monitor-ble-health.py (BLE failures)
      │
      ├── Query database for new errors
      ├── Analyze patterns and trends
      └── Create GitHub issues for problems
```

## 🎓 Usage Examples

### Log Custom Error
```typescript
import { useErrorLogger } from '../utils/ErrorLogger';

const { logCustomError } = useErrorLogger();

logCustomError('User attempted invalid operation', {
  operation: 'deleteAllData',
  reason: 'No confirmation'
});
```

### Track API Call
```typescript
import { performanceLogger } from '../utils/PerformanceLogger';

const result = await performanceLogger.trackApiCall('fetchUserData', async () => {
  return await api.getUserProfile();
});
```

### Track Screen Load
```typescript
import { usePerformanceLogger } from '../utils/PerformanceLogger';

const { trackScreenLoad } = usePerformanceLogger();

useEffect(() => {
  const completeLoad = trackScreenLoad('Home');

  // When screen is ready
  setTimeout(() => completeLoad(), 100);
}, []);
```

### Log BLE Error
```typescript
import { bleErrorLogger } from '../utils/BLEErrorLogger';

try {
  await initializeBLE();
} catch (error) {
  bleErrorLogger.logInitializationError(error);
}
```

## 🔍 Querying Data

### Via Railway CLI
```bash
railway connect postgres

# Recent errors
SELECT error_message, screen_name, COUNT(*)
FROM errors
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY error_message, screen_name;

# Slow operations
SELECT metric_name, AVG(duration_ms), COUNT(*)
FROM performance_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND duration_ms > 5000
GROUP BY metric_name
ORDER BY AVG(duration_ms) DESC;

# BLE errors by type
SELECT error_type, COUNT(*)
FROM ble_errors
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY error_type;
```

### Via API
```bash
# Recent errors
curl https://findable-production.up.railway.app/api/errors/recent

# Slow operations
curl https://findable-production.up.railway.app/api/performance/slow

# BLE error summary
curl https://findable-production.up.railway.app/api/ble-errors/summary
```

## 🚨 Alert Types

### GitHub Issue Examples

**Backend Down:**
```
🔴 Backend Down - 2025-11-09 14:30

The backend did not respond to health check requests.

Actions to take:
1. Check Railway dashboard
2. Check Railway logs
3. Verify database connectivity
```

**User Crash:**
```
🔴 User Error: Cannot read property 'name' of undefined

Occurrences: 5
Screen: ProfileScreen
Platform: Android

Stack Trace:
at ProfileScreen.render (ProfileScreen.tsx:42)
```

**Slow Operation:**
```
⚠️ Slow Operation: api_getUserProfile

Average Duration: 7500ms
Threshold: 5000ms

Actions to take:
1. Profile the operation
2. Check database query performance
```

**BLE Failure:**
```
🔵 Recurring BLE initialization Errors - 8 occurrences

Error Type: initialization
Affected Platforms: Android

Actions to take:
1. Check BLE initialization handling
2. Test on Android devices
```

## 📦 Dependencies

### Python (Backend & Monitoring)
- `requests==2.31.0` - HTTP requests
- `PyGithub==2.1.1` - GitHub API access
- `psycopg2-binary==2.9.9` - PostgreSQL access

### TypeScript (Mobile App)
- `expo-device` - Device information
- `expo-constants` - App constants
- `react-native` - Platform detection
- No additional packages needed!

## ⚙️ Configuration

### GitHub Secrets Required
- `DATABASE_URL` - PostgreSQL connection string
- `MONITOR_TEST_USERNAME` - Test account username
- `MONITOR_TEST_PASSWORD` - Test account password
- `MONITOR_TEST_EMAIL` - Test account email
- `GITHUB_TOKEN` - Auto-provided by GitHub Actions

### Environment Variables (Optional)
- `BACKEND_URL` - Override default backend URL
- `RAILWAY_PROJECT_ID` - For Railway CLI (optional)
- `RAILWAY_TOKEN` - For Railway API access (optional)

## 🎯 Success Criteria

After setup, you should see:
- ✅ Error collection endpoints responding (test with curl)
- ✅ Database tables created and populated
- ✅ GitHub Actions running every 5 minutes
- ✅ Mobile app sending error logs
- ✅ Performance metrics being collected
- ✅ BLE errors being tracked
- ✅ GitHub issues created for problems
- ✅ No false positives (duplicate issues prevented)

## 🛠️ Maintenance

### Daily
- Check GitHub Actions for failures
- Review new issues created
- Check error rates in database

### Weekly
- Review performance trends
- Check for recurring BLE issues
- Clean up resolved issues

### Monthly
- Delete old error data (>30 days)
- Review monitoring thresholds
- Update test credentials if needed

### Clean Up Old Data
```sql
-- Delete errors older than 30 days
DELETE FROM errors WHERE timestamp < NOW() - INTERVAL '30 days';

-- Delete performance metrics older than 7 days
DELETE FROM performance_metrics WHERE timestamp < NOW() - INTERVAL '7 days';

-- Delete BLE errors older than 14 days
DELETE FROM ble_errors WHERE timestamp < NOW() - INTERVAL '14 days';
```

## 📚 Additional Resources

- **Railway Docs:** https://docs.railway.app/
- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **PyGithub Docs:** https://pygithub.readthedocs.io/
- **Expo Error Handling:** https://docs.expo.dev/guides/errors/

## 🎉 What This System Catches

Before this system:
- ❌ No way to know if users experience crashes
- ❌ No performance tracking
- ❌ BLE failures go unnoticed
- ❌ Backend issues only found by users complaining
- ❌ No historical error data

After this system:
- ✅ Every crash logged and tracked
- ✅ Performance issues detected automatically
- ✅ BLE problems identified by device/platform
- ✅ Backend health monitored 24/7
- ✅ GitHub issues auto-created with details
- ✅ Historical data for trend analysis
- ✅ All without Firebase or Sentry costs

---

**System Status:** Ready to deploy
**Est. Setup Time:** 1-2 hours
**Maintenance Required:** Minimal (check Actions daily)
**Cost:** Free (uses GitHub Actions free tier)
