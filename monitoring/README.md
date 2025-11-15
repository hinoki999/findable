# DropLink Error Monitoring System

Complete error monitoring and alerting system for DropLink that catches backend crashes, user errors, performance issues, and BLE failures.

## Overview

This system provides comprehensive monitoring:
- ✅ Backend health (Railway logs, API endpoints, database)
- ✅ User-side errors (JavaScript crashes, exceptions)
- ✅ Performance metrics (slow operations, degradation)
- ✅ BLE errors (initialization, scanning, permissions)
- ✅ Automatic GitHub issue creation
- ✅ 24/7 monitoring via GitHub Actions

## Architecture

```
┌─────────────────────┐
│   Mobile App        │
│  (React Native)     │
│                     │
│  - ErrorLogger      │──┐
│  - PerformanceLogger│──┼─> POST /api/log-error
│  - BLEErrorLogger   │──┘   POST /api/log-performance
└─────────────────────┘     POST /api/log-ble-error
           │
           ▼
┌─────────────────────┐
│  Backend (FastAPI)  │
│                     │
│  Error Collection   │
│  Endpoints          │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  PostgreSQL         │
│                     │
│  - errors           │
│  - performance_     │
│    metrics          │
│  - ble_errors       │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Monitoring Scripts │
│  (Python)           │
│                     │
│  Run every 5 min    │
│  via GitHub Actions │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  GitHub Issues      │
│                     │
│  Auto-created with  │
│  error details      │
└─────────────────────┘
```

## Setup Instructions

### 1. Backend Setup

**Add error collection endpoints to main.py:**

```python
# Add this import at the top of main.py
from error_logging import router as error_logging_router

# Include the router in your FastAPI app
app.include_router(error_logging_router)
```

**Create database tables:**

Run this SQL in your PostgreSQL database (or add to migrations):

```sql
CREATE TABLE IF NOT EXISTS errors (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    user_id INTEGER,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    screen_name VARCHAR(255),
    device_info JSONB,
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_errors_user_id ON errors(user_id);
CREATE INDEX IF NOT EXISTS idx_errors_screen_name ON errors(screen_name);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    user_id INTEGER,
    metric_name VARCHAR(255) NOT NULL,
    duration_ms INTEGER NOT NULL,
    screen_name VARCHAR(255),
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_user_id ON performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_metric_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_slow ON performance_metrics(duration_ms) WHERE duration_ms > 5000;

CREATE TABLE IF NOT EXISTS ble_errors (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    user_id INTEGER,
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    device_info JSONB,
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ble_errors_timestamp ON ble_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ble_errors_user_id ON ble_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_ble_errors_type ON ble_errors(error_type);
```

### 2. Mobile App Integration

**Wrap your app with ErrorBoundary in App.tsx:**

```typescript
import { ErrorBoundary, errorLogger } from './src/utils/ErrorLogger';
import { performanceLogger } from './src/utils/PerformanceLogger';
import { bleErrorLogger } from './src/utils/BLEErrorLogger';
import { useAuth } from './src/contexts/AuthContext';

function App() {
  const { userId } = useAuth();

  // Set user ID for all loggers
  React.useEffect(() => {
    errorLogger.setUserId(userId);
    performanceLogger.setUserId(userId);
    bleErrorLogger.setUserId(userId);
  }, [userId]);

  return (
    <ErrorBoundary>
      <YourAppComponents />
    </ErrorBoundary>
  );
}
```

**Add screen tracking to each screen:**

```typescript
import { performanceLogger } from '../utils/PerformanceLogger';
import { errorLogger } from '../utils/ErrorLogger';

export default function HomeScreen() {
  // Track screen load time
  useEffect(() => {
    errorLogger.setCurrentScreen('Home');
    const completeLoad = performanceLogger.trackScreenLoad('Home');

    // Call when screen is ready
    return () => {
      completeLoad();
    };
  }, []);

  // Rest of your component
}
```

**Track API calls:**

```typescript
import { performanceLogger } from '../utils/PerformanceLogger';

const fetchData = async () => {
  await performanceLogger.trackApiCall('getUserProfile', async () => {
    return await api.getUserProfile();
  });
};
```

**Track BLE operations:**

```typescript
import { bleErrorLogger } from '../utils/BLEErrorLogger';

try {
  // Your BLE initialization code
} catch (error) {
  bleErrorLogger.logInitializationError(error);
}

// Track scan
const scanTracker = bleErrorLogger.trackBLEScan();
try {
  // Scan for devices
  const devices = await scanForDevices();
  scanTracker.complete(devices.length);
} catch (error) {
  scanTracker.error(error.message);
}
```

### 3. GitHub Secrets Configuration

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `DATABASE_URL` - PostgreSQL connection string from Railway
- `MONITOR_TEST_USERNAME` - Test account username for API monitoring
- `MONITOR_TEST_PASSWORD` - Test account password
- `MONITOR_TEST_EMAIL` - Test account email

The `GITHUB_TOKEN` is automatically provided by GitHub Actions.

### 4. Deploy and Test

**Deploy backend changes:**
```bash
git add backend/error_logging.py
git commit -m "Add error collection endpoints"
git push origin develop
```

**Deploy frontend changes:**
```bash
git add mobile/src/utils/
git commit -m "Add error logging utilities"
git push origin develop

cd mobile
npx eas update --branch preview --message "Add error monitoring"
```

**Test the monitoring:**

The GitHub Actions workflow will run automatically every 5 minutes. You can also trigger it manually:

1. Go to GitHub → Actions tab
2. Select "Error Monitoring System"
3. Click "Run workflow"

## Monitoring Scripts

### Backend Monitoring

**monitor-railway-logs.py**
- Monitors Railway backend for crashes and errors
- Checks backend health every 60 seconds
- Creates GitHub issues for downtime

**monitor-database-health.py**
- Tests PostgreSQL connectivity every 60 seconds
- Verifies all required tables exist
- Alerts on database failures

**monitor-api-health.py**
- Hits critical endpoints every 2 minutes
- Tests login, register, profile, etc.
- Alerts on failures or slow responses (>5s)

### User Error Monitoring

**monitor-user-errors.py**
- Queries `errors` table every 60 seconds
- Groups errors by message and screen
- Creates GitHub issues for crashes

**monitor-performance.py**
- Queries `performance_metrics` table every 5 minutes
- Tracks slow operations (>5s)
- Detects performance degradation trends
- Alerts when operations get 50% slower

**monitor-ble-health.py**
- Queries `ble_errors` table every 3 minutes
- Identifies patterns (specific devices, platforms)
- Alerts on widespread BLE failures

## What Gets Caught

✅ **Backend Issues:**
- Server crashes (500 errors)
- Database connectivity problems
- API endpoint failures
- Slow API responses

✅ **User-Side Errors:**
- JavaScript exceptions
- React component crashes
- Unhandled promise rejections
- Custom logged errors

✅ **Performance Problems:**
- Slow screen loads
- Slow API calls
- Photo upload delays
- Performance degradation over time

✅ **BLE Issues:**
- Initialization failures
- Scan failures
- Permission denials
- Connection problems
- Device-specific issues

## GitHub Issue Examples

### Backend Error
```
🔴 Backend Down - 2025-11-09 14:30

The backend did not respond to health check requests.

Actions to take:
1. Check Railway dashboard for deployment status
2. Check Railway logs for crash information
3. Verify database connectivity
```

### User Error
```
🔴 User Error: TypeError: Cannot read property 'name' of undefined

Occurrences: 5 time(s)
Screen: ProfileScreen
Platform: Android

Stack Trace:
at ProfileScreen.render (ProfileScreen.tsx:42)
...

Actions to take:
1. Reproduce the error on ProfileScreen
2. Check the stack trace for the error location
3. Test on Android
```

### Performance Issue
```
⚠️ Slow Operation: api_getUserProfile

Average Duration: 7500ms
Threshold: 5000ms

Actions to take:
1. Profile the operation
2. Check database query performance
3. Consider caching
```

### BLE Error
```
🔵 Recurring BLE initialization Errors - 8 occurrences

Error Type: initialization
Affected Platforms: Android

Actions to take:
1. Check BLE initialization handling
2. Test on Android devices
3. Review permissions flow
```

## Running Monitors Locally

**Install dependencies:**
```bash
cd monitoring
pip install -r requirements.txt
```

**Set environment variables:**
```bash
export DATABASE_URL="postgresql://..."
export GITHUB_TOKEN="ghp_..."
export BACKEND_URL="https://findable-production.up.railway.app"
```

**Run individual monitors:**
```bash
python monitor-railway-logs.py
python monitor-database-health.py
python monitor-api-health.py
python monitor-user-errors.py
python monitor-performance.py
python monitor-ble-health.py
```

Press Ctrl+C to stop.

## Querying Error Data

You can query the error tables directly via Railway CLI:

```bash
railway connect postgres

# Recent errors
SELECT * FROM errors ORDER BY timestamp DESC LIMIT 10;

# Slow operations
SELECT * FROM performance_metrics WHERE duration_ms > 5000 ORDER BY duration_ms DESC LIMIT 10;

# BLE errors by type
SELECT error_type, COUNT(*) FROM ble_errors GROUP BY error_type;
```

Or use the built-in API endpoints:

```bash
curl https://findable-production.up.railway.app/api/errors/recent
curl https://findable-production.up.railway.app/api/performance/slow
curl https://findable-production.up.railway.app/api/ble-errors/summary
```

## Maintenance

**Clean up old data periodically:**

```sql
-- Delete errors older than 30 days
DELETE FROM errors WHERE timestamp < NOW() - INTERVAL '30 days';

-- Delete performance metrics older than 7 days
DELETE FROM performance_metrics WHERE timestamp < NOW() - INTERVAL '7 days';

-- Delete BLE errors older than 14 days
DELETE FROM ble_errors WHERE timestamp < NOW() - INTERVAL '14 days';
```

**Monitor GitHub Actions usage:**

The workflow runs every 5 minutes = 288 times per day. Each job takes ~1-2 minutes. Monitor your GitHub Actions usage to ensure you stay within limits.

## Troubleshooting

**Monitors not creating issues:**
- Check GITHUB_TOKEN has write permissions
- Check DATABASE_URL is correct
- Check tables exist in database
- Check GitHub Actions logs for errors

**No errors being logged from app:**
- Check backend endpoints are deployed
- Check tables exist in database
- Check mobile app has error loggers imported
- Check network requests in browser/app dev tools

**Too many GitHub issues:**
- Monitors deduplicate by hour to avoid spam
- Consider increasing CHECK_INTERVAL
- Consider raising thresholds (SLOW_THRESHOLD, etc.)

## Future Improvements

- [ ] Email notifications via SendGrid
- [ ] Slack notifications
- [ ] Error rate alerts (X errors per minute)
- [ ] Crash-free user percentage tracking
- [ ] Custom dashboards
- [ ] Error grouping improvements
- [ ] Automatic error resolution detection

---

Built for DropLink monitoring. All monitors fail silently and don't affect app performance.
