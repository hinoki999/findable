# API Call Logging System - Complete Summary

Comprehensive logging system that tracks every API call from the mobile app to detect missing or failed backend calls.

## 📁 Files Created/Modified

### Mobile App (TypeScript/React Native)

**`mobile/src/services/api.ts` (MODIFIED)**
- Wrapped `secureFetch()` to log every API call
- Logs: timestamp, endpoint, method, user_id, success, status_code, error
- Extracts user_id from JWT token
- Fire-and-forget logging (won't break app if logging fails)
- Logs both successful and failed API calls

### Backend (Python/FastAPI)

**`backend/main.py` (MODIFIED)**
- Added `/api/log-api-call` endpoint
- Creates `api_call_logs` table automatically
- Stores all API call metadata
- Silent fail if logging fails (returns success: false)

### Monitoring (Python)

**`monitoring/monitor-api-calls.py` (NEW FILE)**
- Detects failed API calls (3+ failures in 10 minutes)
- Detects missing API calls (users viewing but not saving)
- Detects incomplete signup flows
- Detects unusual API call frequency (possible loops)
- Creates GitHub issues with detailed diagnostics

### GitHub Actions

**`.github/workflows/error-monitoring.yml` (MODIFIED)**
- Added `monitor-api-calls` job
- Runs every 5 minutes
- Parallel execution with other monitors
- 10-minute timeout
- Uses DATABASE_URL from secrets

---

## 🎯 What Gets Logged

**Every API call logs:**
- `timestamp` - ISO 8601 format
- `endpoint` - Full URL
- `method` - GET, POST, PUT, DELETE, etc.
- `user_id` - Extracted from JWT token (null if not authenticated)
- `success` - true/false (response.ok)
- `status_code` - HTTP status (200, 404, 500, etc.)
- `error` - Error message if failed (null if successful)

**Where:**
- Database table: `api_call_logs`
- Indexed on: timestamp, user_id, endpoint
- Retention: Monitored for patterns, can be purged after analysis

---

## 🔍 What Gets Detected

### **1. Failed API Calls**
**Threshold:** 3+ failures in 10 minutes for same endpoint

**Creates issue:**
```
🔴 API Failures: POST /user/profile (5 failures)

Endpoint: POST /user/profile
Failures: 5 in last 10 minutes
Affected Users: 3 users
Error Messages:
- Network request failed
- HTTP 500: Internal Server Error

Possible Causes:
- Backend endpoint failing
- Network connectivity issues
```

---

### **2. Missing API Calls - Profile Edits**
**Threshold:** User makes 3+ GET /user/profile requests but never POST

**Creates issue:**
```
⚠️ Missing API Calls: 5 users viewing profile but not saving

Pattern Detected: Users are fetching their profile multiple times but never saving updates.

Affected Users: 5 users
User IDs: 12, 45, 78, 91, 103

Expected Flow:
1. User opens Account screen → GET /user/profile ✓
2. User edits profile field → (local state update) ✓
3. User saves → POST /user/profile ✗ MISSING

Possible Causes:
- AccountScreen updateProfile() not calling API
- UI save button not connected
- Silent error preventing API call
```

This catches the EXACT issue you had where profile data wasn't persisting!

---

### **3. Incomplete Signup Flows**
**Threshold:** POST /auth/register succeeds but no POST /user/profile within 15 minutes

**Creates issue:**
```
⚠️ Incomplete Signups: 3 users registered but profile not saved

Pattern Detected: Users completed registration but profile data was never saved.

Affected Users: 3 new users

Expected Flow:
1. User fills signup form ✓
2. POST /auth/register succeeds ✓
3. POST /user/profile with form data ✗ MISSING

Impact: HIGH - New users losing their profile data on signup
```

---

### **4. High Frequency API Calls**
**Threshold:** 100+ calls to same endpoint in 10 minutes, OR 20+ calls per user

**Creates issue:**
```
⚠️ Unusual API Call Frequency: GET /user/profile

Call Count: 150 calls in 10 minutes
Unique Users: 5 users
Avg per User: 30 calls/user

This may indicate:
- Polling loop not respecting rate limits
- UI triggering API calls on every render
- Retry logic stuck in loop
```

---

## 📊 Database Schema

```sql
CREATE TABLE api_call_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP,
    endpoint TEXT,
    method TEXT,
    user_id INTEGER,
    success BOOLEAN,
    status_code INTEGER,
    error TEXT
);

CREATE INDEX idx_api_logs_timestamp ON api_call_logs(timestamp);
CREATE INDEX idx_api_logs_user_id ON api_call_logs(user_id);
CREATE INDEX idx_api_logs_endpoint ON api_call_logs(endpoint);
```

---

## 🔄 How It Works

### **Mobile App Flow:**

1. User action triggers API call (e.g., save profile)
2. `secureFetch()` is called
3. **BEFORE fetch:**
   - Create log object
   - Extract user_id from token
4. **Fetch request** to backend API
5. **AFTER fetch:**
   - Log success + status code
   - Fire-and-forget POST to `/api/log-api-call`
6. **IF fetch fails:**
   - Log error message
   - Fire-and-forget POST to `/api/log-api-call`
7. Return response to caller (app continues normally)

**Key:** Logging never blocks or breaks the app. If logging fails, app continues.

---

### **Backend Flow:**

1. Receive POST to `/api/log-api-call`
2. Create `api_call_logs` table if doesn't exist
3. Insert log record
4. Commit transaction
5. Return `{success: true}`
6. **IF fails:** Return `{success: false}` (don't raise error)

**Key:** Backend logging is optional. If it fails, mobile app doesn't care.

---

### **Monitoring Flow:**

Every 5 minutes (GitHub Actions):

1. **Query database** for api_call_logs
2. **Analyze patterns:**
   - Count failures by endpoint
   - Detect missing expected calls
   - Find incomplete user flows
   - Identify high-frequency anomalies
3. **Create GitHub issues** for problems
4. **Skip** if issue already exists (no duplicates)

**Key:** Automated detection of issues before users report them.

---

## 🧪 Example Queries

**View recent API calls:**
```sql
SELECT timestamp, method, endpoint, user_id, success, status_code
FROM api_call_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 100;
```

**Find failed calls:**
```sql
SELECT endpoint, method, COUNT(*) as failures, array_agg(DISTINCT error)
FROM api_call_logs
WHERE success = false
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY endpoint, method
ORDER BY failures DESC;
```

**Check user activity:**
```sql
SELECT user_id, COUNT(*) as api_calls,
       COUNT(DISTINCT endpoint) as unique_endpoints,
       SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
       SUM(CASE WHEN success THEN 0 ELSE 1 END) as failures
FROM api_call_logs
WHERE user_id = 123
  AND timestamp > NOW() - INTERVAL '1 day'
GROUP BY user_id;
```

**Detect signup → profile save pattern:**
```sql
WITH signups AS (
    SELECT user_id, timestamp
    FROM api_call_logs
    WHERE endpoint LIKE '%/auth/register'
      AND method = 'POST'
      AND success = true
),
profile_saves AS (
    SELECT user_id, timestamp
    FROM api_call_logs
    WHERE endpoint LIKE '%/user/profile'
      AND method = 'POST'
)
SELECT s.user_id, s.timestamp as signup_time,
       p.timestamp as profile_save_time,
       EXTRACT(EPOCH FROM (p.timestamp - s.timestamp)) as seconds_between
FROM signups s
LEFT JOIN profile_saves p ON s.user_id = p.user_id
WHERE s.timestamp > NOW() - INTERVAL '1 day';
```

---

## 🚀 Deployment

**Requires:**
1. Backend deployment (Railway) - adds `/api/log-api-call` endpoint
2. Frontend deployment (EAS Update) - adds logging to secureFetch
3. GitHub Actions already configured - will auto-run monitor

**No additional secrets needed:**
- Uses existing `DATABASE_URL`
- Uses existing `GITHUB_TOKEN`

---

## ✅ What This Solves

**Before:**
- ❌ No visibility into API calls from mobile app
- ❌ Users report "data not saving" but unclear why
- ❌ Can't tell if mobile app is calling backend or not
- ❌ Manual testing required to reproduce issues

**After:**
- ✅ Every API call logged with full context
- ✅ Automatic detection of missing/failed calls
- ✅ GitHub issues created with detailed diagnostics
- ✅ Can query database to understand user behavior
- ✅ Proactive monitoring catches issues before users report

---

## 🎯 Use Cases

**1. Debugging "data not saving" issues:**
```
Query: Did user 123 call POST /user/profile?
Answer: No - they called GET 5 times but never POST
Root cause: Save button not wired up correctly
```

**2. Detecting backend failures:**
```
Query: Why are users complaining about errors?
Answer: POST /user/profile is returning 500 for 20% of requests
Root cause: Backend database connection timeout
```

**3. Understanding user behavior:**
```
Query: How often do users edit their profile?
Answer: 80% of users call GET /user/profile but only 20% call POST
Insight: UI is confusing, users don't know how to save
```

**4. Performance monitoring:**
```
Query: Are any endpoints being called excessively?
Answer: GET /devices called 1000 times in 10 minutes by user 45
Root cause: Polling loop running too fast
```

---

## 🧹 Maintenance

**Clean up old logs:**
```sql
-- Delete logs older than 30 days
DELETE FROM api_call_logs
WHERE timestamp < NOW() - INTERVAL '30 days';
```

**Disable logging temporarily:**
```typescript
// In mobile/src/services/api.ts, comment out logging code
// (or add environment variable to control it)
```

**Adjust monitoring thresholds:**
```python
# In monitoring/monitor-api-calls.py
# Change HAVING COUNT(*) >= 3 to higher/lower values
```

---

## 📈 Success Metrics

After deployment, you should see:
- ✅ `api_call_logs` table populating
- ✅ GitHub Actions job running every 5 minutes
- ✅ Issues created for detected problems
- ✅ Zero false positives (no duplicate issues)
- ✅ Early detection of issues (before user reports)

---

**System Status:** Ready to deploy
**Maintenance Required:** Minimal (clean up logs monthly)
**Performance Impact:** Negligible (fire-and-forget logging)
**Cost:** Free (uses existing GitHub Actions)
