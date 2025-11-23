# 🚀 Quick Start Guide

Get the DropLink testing suite running in 5 minutes.

## Step 1: Install Dependencies

```bash
cd testing

# Python dependencies
pip install pytest requests psycopg2-binary

# Node.js dependencies
npm install
```

## Step 2: Set Environment Variables

```bash
# Windows PowerShell
$env:BACKEND_URL="https://findable-production.up.railway.app"
$env:TEST_PASSWORD="your_password_here"
$env:DATABASE_URL="postgresql://..."
$env:EXPO_TOKEN="your_expo_token"

# Or create .env file (NOT recommended for production)
```

## Step 3: Run Tests

### Backend Tests
```bash
cd testing
pytest backend-tests/ -v
```

### Integration Tests
```bash
cd testing
npm test
```

## Expected Output

### ✅ All Tests Passing
```
backend-tests/test_auth.py::test_login_success PASSED
✓ Login successful for user caitie690 (ID: 123)

backend-tests/test_profile.py::test_profile_get PASSED
✓ Profile retrieved: hasCompletedOnboarding=true

backend-tests/test_persistence.py::test_onboarding_persists_in_database PASSED
✓ Database verification passed: has_completed_onboarding = 1

integration-tests/ota-validation.test.js
  ✓ should fetch updates from preview branch (5234ms)
  ✓ should have correct runtime version (12ms)
```

## GitHub Actions Setup

### Add Secrets
1. Go to: `https://github.com/hinoki999/findable/settings/secrets/actions`
2. Add new secrets:
   - `BACKEND_URL`: https://findable-production.up.railway.app
   - `TEST_PASSWORD`: (your password)
   - `DATABASE_URL`: (Railway PostgreSQL connection string)
   - `EXPO_TOKEN`: (from Expo dashboard)

### Workflow Will Auto-Run On:
- ✅ Push to develop/main
- ✅ Pull requests
- ✅ Every hour (scheduled)
- ✅ Manual dispatch

## Troubleshooting

### "TEST_PASSWORD not set"
```bash
export TEST_PASSWORD="your_password"
```

### "Cannot connect to database"
- Get DATABASE_URL from Railway dashboard
- Test connection: `psql $DATABASE_URL`

### "EXPO_TOKEN not set"
- Get token from: https://expo.dev/settings/access-tokens
- Needs read access to @hirule/mobile project

## Quick Commands

```bash
# Run all tests
pytest backend-tests/ -v && npm test

# Run specific test
pytest backend-tests/test_auth.py::test_login_success -v

# Run with output
pytest backend-tests/ -v -s

# Run Jest with verbose output
npm test -- --verbose
```

## What Gets Tested

- ✅ Authentication (login, tokens)
- ✅ Profile API (GET/POST)
- ✅ Database persistence (PostgreSQL)
- ✅ Tutorial completion flow
- ✅ OTA update validation
- ✅ Runtime version matching

## Success!

If all tests pass, your system is:
- ✅ Backend API working
- ✅ Database saving correctly
- ✅ OTA updates deploying
- ✅ Tutorial system functional

**You're ready for production!** 🎉

