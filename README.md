# DropLink App - Developer Documentation

**Last Updated:** November 9, 2025

---

## Project Overview

**App Name:** DropLink (also referred to as Findable)

**Purpose:** Proximity-based social networking application using Bluetooth Low Energy (BLE) technology to discover and connect with nearby users.

**Core Features:**
- Real-time proximity detection via BLE
- Profile creation with photos and contact info
- Accept/decline connection requests
- Contact history and pinned favorites
- Privacy zones to disable scanning in specific locations
- Radar view showing nearby users
- Tutorial system for first-time users

**Tech Stack:**
- **Frontend:** React Native with Expo (TypeScript)
- **Backend:** Python with FastAPI
- **Database:** PostgreSQL (hosted on Railway)
- **Image Storage:** Cloudinary
- **Authentication:** JWT tokens with SecureStore
- **Deployment:** Railway (backend), Expo Application Services (frontend OTA updates)

---

## Repository Structure

```
droplin/
├── mobile/               # React Native/Expo app
│   ├── src/
│   │   ├── screens/     # App screens (Home, Account, History, etc.)
│   │   ├── contexts/    # React contexts (Auth, User, Tutorial, etc.)
│   │   ├── services/    # API calls, storage, BLE
│   │   └── theme.ts     # Theme/styling
│   ├── App.tsx          # Root component
│   └── package.json
│
├── backend/             # Python FastAPI backend
│   ├── main.py          # Main application file (~3000 lines)
│   └── requirements.txt
│
└── testing/             # Automated test suite
    └── integration-tests/
        ├── auth-flow.test.js
        ├── profile-endpoints.test.js
        └── tutorial-flow.test.js
```

---

## Development Workflow

### Local Development
**Local Path:** `C:\Users\caiti\Documents\droplin\mobile`

**Running the app locally:**
```bash
cd C:\Users\caiti\Documents\droplin\mobile
npm start
```
Then scan QR code with Expo Go app on your device.

### Version Control
**Repository:** https://github.com/hinoki999/findable
**Primary Branch:** `develop`
**Strategy:** All development happens on develop branch - no separate staging

### Backend Deployment (Railway)
**Platform:** Railway.app
**Production URL:** https://findable-production.up.railway.app

**Auto-Deploy Process:**
1. Push changes to `develop` branch on GitHub
2. Railway automatically detects push via webhook
3. Backend rebuilds and deploys (takes ~2-3 minutes)
4. PostgreSQL database persists across deployments

**Deploying backend changes:**
```bash
cd C:\Users\caiti\Documents\droplin
git add backend/
git commit -m "Fix: description of backend changes"
git push origin develop
```
Railway auto-deploys immediately. Check logs at Railway dashboard.

### Frontend OTA Updates (EAS)
**Platform:** Expo Application Services
**Project:** `@hirule/mobile`
**Update Branch:** `preview`

**Important:** Updates do NOT download automatically. We manually push every time.

**Deploying frontend changes:**
```bash
cd C:\Users\caiti\Documents\droplin
git add mobile/
git commit -m "Fix: description of frontend changes"
git push origin develop

cd mobile
npx eas update --branch preview --message "Description of changes"
```

Users must manually open the app to receive the update - it does not auto-download.

### Complete Development Cycle

**1. Make Code Changes**
```bash
# Edit files locally in C:\Users\caiti\Documents\droplin
```

**2. Commit to GitHub**
```bash
git add .
git commit -m "Fix: description"
git push origin develop
```

**3a. Backend Changes (Auto-Deploy)**
- Railway detects push and auto-deploys
- Check Railway dashboard for build status
- Deployment takes ~2-3 minutes

**3b. Frontend Changes (Manual Deploy)**
```bash
cd mobile
npx eas update --branch preview --message "Description"
```
- Users get update next time they manually open the app
- Check Expo dashboard for update status

---

## Backend Endpoints

**Base URL:** `https://findable-production.up.railway.app`

### Authentication
- `POST /auth/register` - User signup (**NOTE:** Use `/register`, NOT `/signup`)
- `POST /auth/login` - User login (returns JWT token)
- `POST /auth/verify-code` - Verify 6-digit email codes
- `POST /auth/change-username` - Update username (requires token)
- `POST /auth/change-password` - Update password (requires token)

### Profile Management
- `GET /user/profile` - Get user profile (includes `has_completed_onboarding`)
- `POST /user/profile` - Update profile (name, email, phone, bio)
- `POST /user/profile/photo` - Upload profile photo to Cloudinary
- `DELETE /user/delete` - Delete account (requires verification code)

### Settings & Privacy
- `GET /user/settings` - Get user settings (darkMode, maxDistance, privacyZones)
- `POST /user/settings` - Update settings
- `GET /user/privacy-zones` - Get privacy zones
- `POST /user/privacy-zones` - Add privacy zone
- `DELETE /user/privacy-zones/{id}` - Delete privacy zone

### Contacts
- `GET /user/pinned` - Get pinned contact IDs
- `POST /user/pinned/{deviceId}` - Pin a contact
- `DELETE /user/pinned/{deviceId}` - Unpin a contact

### Devices
- `GET /devices` - Get all devices for user
- `POST /devices` - Save a discovered device
- `DELETE /devices/{id}` - Delete a device

### Admin
- `DELETE /admin/clear-all-data` - Wipe entire database
  **Header Required:** `secret: delete-all-profiles-2024`

---

## Database

**Type:** PostgreSQL (managed by Railway)
**Access:** Via Railway CLI: `railway connect postgres`

### Schema - `user_profiles` table:
```sql
user_id INTEGER PRIMARY KEY
name TEXT
email TEXT
phone TEXT
bio TEXT
profile_photo TEXT
social_media JSON
has_completed_onboarding INTEGER DEFAULT 0
```

### Schema - `users` table:
```sql
id INTEGER PRIMARY KEY
username TEXT UNIQUE
email TEXT
password_hash TEXT
created_at TIMESTAMP
```

### Admin Operations:
**Wipe all data:**
```bash
curl -X DELETE https://findable-production.up.railway.app/admin/clear-all-data \
  -H "secret: delete-all-profiles-2024"
```

---

## Known Production Issues

### 🔴 Critical Issues

#### Issue #1: Tutorials Not Showing At All
**Expected:** Tutorials show on first signup
**Actual:** Tutorials don't appear at all

**Attempted Solutions:**

**Attempt 1 - Local Storage Flag (Failed)**
- Date: November 3, 2025
- Approach: Used AsyncStorage flag `SHOW_TUTORIALS_FLAG`
- Why it failed: AsyncStorage clears on app reinstall
- Files modified: `TutorialContext.tsx`

**Attempt 2 - Backend hasCompletedOnboarding Flag (Partial)**
- Date: November 3, 2025
- Approach: Added `has_completed_onboarding` column to backend database
- Files modified: `backend/main.py` (lines 313, 2559, 2676)
- Status: Backend updated but frontend not checking it properly
- Issue: Database column added but not being set during tutorial completion

**Attempt 3 - Tutorial Completion Hook (Failed)**
- Date: November 3, 2025
- Approach: Added backend POST when tutorials complete
- Files modified: `TutorialContext.tsx` (lines 144-161)
- Why it failed: Function called but backend not receiving/saving data correctly

**Attempt 4 - Signup Flow Integration (Current)**
- Date: November 9, 2025
- Approach: Call `startScreenTutorial('Home', 5)` immediately after signup
- Files modified: `SignupScreen.tsx` (line 18, 392)
- Status: Pushed but not yet tested
- Result: Tutorials still not showing at all

**Current State:**
- ❌ Broken after 4+ attempts
- Backend has column but data not persisting
- Frontend has multiple checks but not coordinated
- Root cause: Coordination between frontend trigger and backend persistence

---

#### Issue #2: Profile Information Not Saving
**Expected:** Name, email, phone save to backend and persist
**Actual:** No error shown, but data doesn't save consistently

**Attempted Solutions:**

**Attempt 1 - Database Wipe & Restart (Nov 9)**
- Approach: Wiped database, restarted Railway backend
- Command: `curl -X DELETE https://findable-production.up.railway.app/admin/clear-all-data`
- Status: Database cleared but issue persists
- Files checked: `main.py` profile save endpoint

**Attempt 2 - Migration Code Addition**
- Approach: Added migration to create missing `has_completed_onboarding` column
- Files modified: `main.py` (lines 376-383)
- Status: Migration code exists but may not have run
- Issue: Railway restart didn't trigger table alteration

**Attempt 3 - Email Bypass for Testing**
- Approach: Allow `caitie690@gmail.com` to create multiple test accounts
- Files modified: `main.py` (line 1296)
- Status: Code exists locally but effectiveness unknown

**Current State:**
- ❌ Profile data saves inconsistently
- ❌ Blocks testing of tutorial fixes
- Backend endpoint exists but data not reliably reaching database

---

#### Issue #3: Account Deletion Failing
**Expected:** Enter verification code → Account deleted
**Actual:** "Failed to delete account" error

**Root Cause:**
- Primary issue: Delete endpoint failing even when email exists
- Secondary issue: Cannot send verification code when profile email doesn't save (see Issue #2)
- Email saving is inconsistent but not the only problem
- Account deletion fails even when email has been successfully saved to profile

**Attempted Solutions:**
None yet - need to investigate delete endpoint logic

**Current State:**
- ❌ Cannot delete test accounts reliably
- ❌ Issue persists even when email is saved to profile
- Need to debug delete endpoint directly

---

### 🟡 Medium Priority Issues

#### Issue #4: Photo Upload File Type Restrictions
**Expected:** Accept various photo formats (JPEG, PNG, HEIC, WebP, etc.)
**Actual:** Only accepts JPEG and PNG

**Current Implementation:**
- Backend validates: `"image/jpeg"`, `"image/png"`, `"image/jpg"`
- Location: `backend/main.py` line ~2733

**Solution Needed:**
Add support for additional formats:
- `"image/heic"` - iPhone photos
- `"image/heif"` - Modern format
- `"image/webp"` - Web-optimized
- `"image/bmp"` - Bitmap

**Files to Modify:**
- `backend/main.py` - Update `upload_profile_photo()` content type validation

**Status:** Not yet implemented

---

#### Issue #5: Blips Not Showing on Radar
**Expected:** Nearby users appear as green blips
**Actual:** No blips visible

**Status:**
- Not yet investigated
- Lower priority than tutorial/profile/deletion issues
- May be related to BLE scanning or data formatting

---

## Pattern of Failures

**Common Issues:**
1. **Tutorial persistence** - 4+ attempts, still broken
2. **Profile saving** - 3+ attempts, still inconsistent
3. **Account deletion** - Fails even when data exists
4. **Coordination issues** - Backend has code, frontend has code, but they don't communicate properly
5. **Cascade failures** - Profile issues break other features

**Root Causes Identified:**
- Database migrations don't run automatically on Railway restart
- AsyncStorage/backend data sync issues
- Frontend state not properly reflecting backend data
- Error handling too permissive (fails silently)
- No structured logging makes debugging difficult

---

## Automated Testing

**Test Runner:** GitHub Actions (runs hourly + on every push to develop)
**Test Location:** `testing/integration-tests/`

**Test Coverage:**
- ✅ Auth flow (signup, login, token verification)
- ✅ Profile CRUD operations
- ✅ Tutorial flow (basic checks)
- ❌ Account deletion (not tested)
- ❌ Photo upload (not tested)
- ❌ Bluetooth/BLE functionality (not tested)
- ❌ Privacy zones (not tested)
- ❌ Pinned contacts (not tested)

**Running Tests Locally:**
```bash
cd testing/integration-tests
npm test
```

**Test Files:**
- `auth-flow.test.js` - Signup, login, verification
- `profile-endpoints.test.js` - Profile CRUD operations
- `tutorial-flow.test.js` - Tutorial state management

**Note:** OTA validation test was removed (we don't use automatic OTA updates)

---

## 🤖 Error Monitoring System

**Status:** Active 24/7
**Location:** `.github/workflows/error-monitoring.yml`
**Dashboard:** GitHub Actions → Error Monitoring workflow

### What It Monitors

**Backend Monitoring (Real-time):**
- ✅ Railway backend logs (crashes, 500 errors, exceptions)
- ✅ PostgreSQL database health (connectivity, query failures)
- ✅ API endpoint health (login, profile, deletion)
- ✅ Response times and timeouts

**User-Side Monitoring (App crashes & performance):**
- ✅ JavaScript errors and app crashes
- ✅ Screen load times and performance metrics
- ✅ BLE initialization and scan failures
- ✅ Photo upload failures
- ✅ API request durations

### How It Works

**Backend monitors run every 60 seconds:**
- `monitor-railway-logs.py` - Streams backend logs for errors
- `monitor-database-health.py` - Checks PostgreSQL connectivity
- `monitor-api-health.py` - Tests all critical endpoints
- `monitor-user-errors.py` - Checks for new crash reports
- `monitor-performance.py` - Alerts on slow operations
- `monitor-ble-health.py` - Tracks BLE failure patterns

**Mobile app automatically logs:**
- All JavaScript errors → `POST /api/log-error`
- Performance metrics → `POST /api/log-performance`
- BLE failures → `POST /api/log-ble-error`

### Alert System

**When errors detected:**
1. Monitor detects error/crash/failure
2. Creates GitHub issue with details
3. Sends email notification immediately
4. Issue includes: error message, stack trace, timestamp, affected users

**GitHub Issues Format:**
- `[ERROR]` - Backend crashes or API failures
- `[CRASH]` - User app crashes
- `[PERFORMANCE]` - Slow operations detected
- `[BLE]` - Bluetooth issues
- `[DATABASE]` - PostgreSQL problems

### Error Storage

**PostgreSQL Tables:**
- `errors` - JavaScript crashes from user devices
- `performance_metrics` - Screen loads, API durations
- `ble_errors` - Bluetooth initialization/scan failures

**Query errors:**
```sql
-- Recent crashes
SELECT * FROM errors ORDER BY timestamp DESC LIMIT 10;

-- Slow operations
SELECT * FROM performance_metrics WHERE duration_ms > 5000;

-- BLE failure patterns
SELECT error_type, COUNT(*) FROM ble_errors GROUP BY error_type;
```

### Monitoring Coverage

**✅ Catches:**
- Backend API errors (500s, crashes)
- Database connection failures
- User app crashes (JavaScript errors)
- Slow performance (>5 second operations)
- BLE detection failures
- Photo upload issues
- Login/signup failures
- Profile save failures
- Account deletion failures

**❌ Doesn't Catch:**
- Visual/UI bugs (buttons in wrong place)
- Native crashes (Android/iOS system level)
- Network connectivity on user's device

### Maintenance

**No maintenance required** - Runs automatically 24/7.

**To view errors:**
1. Go to GitHub → Issues tab
2. Filter by `[ERROR]`, `[CRASH]`, etc.
3. Or query PostgreSQL error tables directly

**To disable monitoring:**
```bash
# Disable in GitHub Actions settings
Settings → Actions → Disable "Error Monitoring" workflow
```

---

## Next Steps (Priority Order)

1. **Fix account deletion** - Critical for managing test accounts
2. **Fix tutorial display** - Core onboarding feature
3. **Stabilize profile saving** - Foundational feature
4. **Add photo format support** - User experience improvement
5. **Investigate radar blips** - Core app functionality
6. **Expand test coverage** - Add deletion, photo, BLE tests

---

## Development Best Practices

### Before Making Changes
- Check Railway logs for backend errors
- Review recent commits for context
- Test locally before pushing to develop

### After Making Changes
- **Backend:** Push to develop → Check Railway deployment logs
- **Frontend:** Push to develop → Run `npx eas update` → Test on device
- **Database:** Verify schema changes via Railway CLI

### Debugging Tips
- Use Railway CLI to inspect database: `railway connect postgres`
- Check Expo dashboard for OTA update delivery
- Monitor GitHub Actions for test failures
- Add console logs liberally (backend uses print statements)

### Known Technical Debt
- Tutorial logic spread across multiple files (needs consolidation)
- FormData uses `as any` type cast (removes TypeScript type safety)
- Database migrations don't auto-run (need manual trigger)
- No structured logging on backend (using print)
- Error messages too generic for debugging

---

## Troubleshooting Quick Reference

**Backend not deploying after push?**
- Check Railway dashboard for build logs
- Verify GitHub webhook is connected
- Confirm Railway project linked to correct repo/branch

**Frontend updates not appearing?**
- Confirm you ran `npx eas update --branch preview`
- Users must manually open app to download update
- Check Expo dashboard for update delivery status

**Database changes not persisting?**
- Railway may need manual restart to run migrations
- Check Railway logs for SQL errors
- Use Railway CLI to inspect table schema: `railway connect postgres`

**Tests failing on GitHub Actions?**
- Verify backend is responding (Railway may be down)
- Check if API endpoints changed
- Confirm test credentials still valid

**Profile data not saving?**
- Check if `has_completed_onboarding` column exists
- Verify JWT token is valid and not expired
- Check UserContext initialization in App.tsx
- Inspect database directly via Railway CLI

**Account deletion failing?**
- Verify email exists in user profile
- Check verification code was sent and received
- Review Railway logs for delete endpoint errors
- Confirm JWT token has correct user_id
- Note: Issue persists even when email is saved correctly

---

## Environment Variables (Railway)

These are configured in the Railway dashboard:

**Required:**
- `DATABASE_URL` - PostgreSQL connection (auto-managed by Railway)
- `JWT_SECRET` - Secret for JWT token generation
- `CLOUDINARY_CLOUD_NAME` - Image upload service
- `CLOUDINARY_API_KEY` - Cloudinary authentication
- `CLOUDINARY_API_SECRET` - Cloudinary authentication
- `SMTP_SERVER` - Email service for verification codes
- `SMTP_PORT` - Email service port
- `SMTP_USERNAME` - Email service username
- `SMTP_PASSWORD` - Email service password
- `SMTP_FROM_EMAIL` - Sender email address

**Frontend ENV (mobile/src/config/environment.ts):**
- `BASE_URL` - Backend API URL
- `ENFORCE_HTTPS` - Whether to force HTTPS in production

---

## Additional Resources

**Railway Dashboard:** Monitor deployments and view logs (health checks configured)
**Expo Dashboard:** Track OTA updates and build status
**GitHub Actions:** View automated test results and error monitoring
**Cloudinary Dashboard:** Monitor image uploads and storage
**Error Monitoring:** GitHub Actions → Error Monitoring workflow (runs 24/7)

---

## Notes for Future Development

### Architecture Improvements Needed
- Move to TypeScript backend for better type safety
- Implement proper database migration tool (Alembic for SQLAlchemy)
- Add structured logging (replace print statements)
- Consolidate tutorial state management
- Implement proper retry logic for network requests
- Add backend API documentation (Swagger/OpenAPI)

### Feature Requests / TODOs
- [ ] Support more image formats (HEIC, WebP, HEIF)
- [ ] Fix tutorial display on first signup
- [ ] Stabilize account deletion
- [ ] Investigate radar blip visibility
- [ ] Add automated tests for deletion/photos/BLE
- [ ] Consider rate limiting on sensitive endpoints
