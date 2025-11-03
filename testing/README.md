# DropLink Production Testing Suite

Comprehensive testing infrastructure for the DropLink mobile app to catch OTA deployment issues and backend persistence problems.

## 📁 Structure

```
testing/
├── backend-tester.py       # Backend API endpoint tests
├── database-validator.py   # Direct PostgreSQL database validation
├── ota-monitor.js          # GitHub Actions & EAS update monitoring
├── integration-tester.js   # End-to-end user flow testing
├── run-all-tests.ps1       # Master test orchestrator (PowerShell)
├── logs/                   # Individual test logs (auto-created)
└── ERRORS.log             # Consolidated error log
```

## 🚀 Quick Start

### Prerequisites

1. **Python 3.x** (for backend-tester.py and database-validator.py)
   ```powershell
   pip install requests psycopg2-binary
   ```

2. **Node.js** (for ota-monitor.js and integration-tester.js)
   ```powershell
   # Node.js includes https module by default - no install needed
   ```

3. **PowerShell** (for run-all-tests.ps1)
   - Pre-installed on Windows

### Environment Setup

Set these environment variables (optional but recommended):

```powershell
# GitHub token (for Actions monitoring)
$env:GITHUB_TOKEN = "ghp_your_github_token_here"

# Expo token (for EAS monitoring)
$env:EXPO_TOKEN = "your_expo_token_here"

# Database URL (for direct DB validation)
$env:DATABASE_URL = "postgresql://user:pass@host:port/dbname"
```

### Running Tests

**Option 1: Run all tests continuously (recommended)**
```powershell
cd testing
.\run-all-tests.ps1
```

**Option 2: Run individual tests**
```powershell
# Backend API tests
python backend-tester.py

# Database validation
python database-validator.py

# OTA monitoring
node ota-monitor.js

# Integration tests
node integration-tester.js
```

## 📊 What Each Test Does

### 1. Backend API Tests (`backend-tester.py`)
- ✅ Tests POST /auth/signup
- ✅ Tests POST /auth/login
- ✅ Tests GET /user/profile (includes hasCompletedOnboarding)
- ✅ Tests POST /user/profile (updates hasCompletedOnboarding)
- ✅ Validates data persistence across requests

### 2. Database Validation (`database-validator.py`)
- ✅ Directly queries Railway PostgreSQL
- ✅ Checks user_profiles table for test user
- ✅ Validates has_completed_onboarding column
- ✅ Logs when values change (or fail to change)

### 3. OTA Monitor (`ota-monitor.js`)
- ✅ Polls GitHub Actions API for workflow status
- ✅ Checks "OTA Update on Push" workflow runs
- ✅ Verifies workflow success/failure
- ✅ Monitors EAS update deployments
- ✅ Validates runtime version (1.0.1)

### 4. Integration Tests (`integration-tester.js`)
- ✅ **Signup Flow**: Create user → Set onboarding flag → Verify persistence
- ✅ **Login Flow**: Login existing user → Check onboarding status
- ✅ **Tutorial Completion**: Reset flag → Complete tutorials → Verify backend update

## 🎯 Key Features

### Continuous Monitoring
- Runs all tests every 60 seconds by default
- Catches issues as they happen in production
- No manual intervention required

### Color-Coded Output
- 🟢 Green = Tests passed
- 🔴 Red = Tests failed
- 🟡 Yellow = Warnings or in-progress

### Comprehensive Logging
- Individual log files per test in `logs/` directory
- Consolidated `ERRORS.log` for all failures
- Timestamps on every log entry

### Production-Ready
- Tests against live Railway backend
- Monitors real GitHub Actions workflows
- Validates actual EAS deployments
- Uses real user accounts and data

## 🔧 Configuration

Edit the configuration at the top of each file:

**backend-tester.py & integration-tester.js:**
```python
BASE_URL = "https://findable-production.up.railway.app"
TEST_USER = "caitie690"
TEST_PASSWORD = "your_password_here"  # Update this!
```

**database-validator.py:**
```python
DATABASE_URL = os.environ.get('DATABASE_URL', '')
TEST_USER = "caitie690"
```

**ota-monitor.js:**
```javascript
githubRepo: 'hinoki999/findable',
easProject: '@hirule/mobile',
easBranch: 'preview',
runtimeVersion: '1.0.1'
```

**run-all-tests.ps1:**
```powershell
$TestInterval = 60  # Seconds between test runs
```

## 📝 Common Issues & Solutions

### "❌ Login failed"
- Update `TEST_PASSWORD` in backend-tester.py and integration-tester.js
- Verify user exists in database

### "❌ DATABASE_URL not set"
- Get connection string from Railway dashboard
- Set environment variable: `$env:DATABASE_URL='postgresql://...'`

### "⚠️ GITHUB_TOKEN not set"
- Create token at: https://github.com/settings/tokens
- Set environment variable: `$env:GITHUB_TOKEN='ghp_...'`

### "⚠️ EXPO_TOKEN not set"
- Get token from: https://expo.dev/accounts/[account]/settings/access-tokens
- Set environment variable: `$env:EXPO_TOKEN='...'`

## 🎯 What We're Testing For

These tests specifically catch the issues you're experiencing:

1. **Backend Persistence Issues**
   - Does `hasCompletedOnboarding` actually save to database?
   - Does it persist across logout/login cycles?
   - Does it sync across devices?

2. **OTA Update Deployment**
   - Do pushes to `develop` trigger GitHub Actions?
   - Does the workflow publish to EAS correctly?
   - Are updates reaching the `preview` branch?
   - Is the runtime version correct (1.0.1)?

3. **Tutorial System Integration**
   - Does signup set the onboarding flag?
   - Does tutorial completion update the backend?
   - Does login skip tutorials for existing users?

## 📈 Success Metrics

All tests passing means:
- ✅ Backend API is responding correctly
- ✅ Database is storing data properly
- ✅ OTA updates are deploying successfully
- ✅ Tutorial system is working end-to-end
- ✅ User data persists across sessions

## 🚨 When Tests Fail

Check `ERRORS.log` for detailed error messages. Common failure patterns:

- **All backend tests failing** → Backend server issue
- **Database validation failing** → Data not persisting to DB
- **OTA monitor failing** → GitHub Actions or EAS deployment issue
- **Integration tests failing** → End-to-end flow broken

## 💡 Tips

1. **Run tests before pushing code** - Catch issues early
2. **Leave tests running** - Continuous monitoring catches intermittent issues
3. **Check logs after failed deployments** - See what broke
4. **Monitor ERRORS.log** - One place for all failures

## 🎉 Next Steps

Once tests are passing consistently:
1. Add more test cases for edge cases
2. Set up automated alerts (email/Slack)
3. Integrate with CI/CD pipeline
4. Add performance benchmarks

---

**Happy Testing! 🚀**

If you find bugs the tests aren't catching, add new test cases to improve coverage.

