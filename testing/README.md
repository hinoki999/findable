# DropLink Production Testing Suite

Comprehensive production-grade testing infrastructure for the DropLink mobile app.

## 🏗️ Architecture

```
testing/
├── backend-tests/           # Pytest backend API tests
│   ├── conftest.py         # Pytest fixtures (auth, database)
│   ├── test_auth.py        # Authentication tests
│   ├── test_profile.py     # Profile API tests
│   └── test_persistence.py # Database persistence tests
├── integration-tests/       # Jest integration tests
│   ├── tutorial-flow.test.js   # Tutorial completion flow
│   ├── ota-validation.test.js  # EAS update validation
│   └── jest.config.js
├── package.json
├── pytest.ini
└── README.md

.github/workflows/
└── test-suite.yml          # CI/CD pipeline
```

## 🚀 Quick Start

### Prerequisites

**Python 3.11+:**
```bash
pip install pytest requests psycopg2-binary
```

**Node.js 18+:**
```bash
cd testing
npm install
```

### Environment Variables

Create `.env` file or export:

```bash
export BACKEND_URL="https://findable-production.up.railway.app"
export TEST_PASSWORD="your_password_here"
export DATABASE_URL="postgresql://user:pass@railway.app:5432/railway"
export EXPO_TOKEN="your_expo_token_here"
```

## 🧪 Running Tests

### Backend Tests (Pytest)

```bash
cd testing

# Run all backend tests
pytest backend-tests/ -v

# Run specific test file
pytest backend-tests/test_auth.py -v

# Run specific test
pytest backend-tests/test_profile.py::test_profile_get -v

# Run with markers
pytest backend-tests/ -m auth -v
```

### Integration Tests (Jest)

```bash
cd testing

# Run all integration tests
npm test

# Run specific test file
npm test ota-validation.test.js

# Run in watch mode
npm run test:watch

# Run OTA tests only
npm run test:ota

# Run tutorial flow tests only
npm run test:tutorial
```

## 📊 Test Coverage

### Backend Tests (`backend-tests/`)

#### **test_auth.py** - Authentication
- ✅ `test_login_success()` - Login with valid credentials
- ✅ `test_login_invalid_password()` - Invalid password rejected
- ✅ `test_token_validity()` - JWT token works for protected endpoints

#### **test_profile.py** - Profile API
- ✅ `test_profile_get()` - GET /user/profile returns hasCompletedOnboarding
- ✅ `test_profile_update_onboarding_true()` - Set flag to true
- ✅ `test_profile_update_onboarding_false()` - Set flag to false
- ✅ `test_profile_partial_update()` - Partial update preserves other fields

#### **test_persistence.py** - Database
- ✅ `test_onboarding_persists_in_database()` - Direct PostgreSQL verification
- ✅ `test_onboarding_false_persists()` - False value persists correctly
- ✅ `test_multiple_updates_persist()` - Sequential updates work
- ✅ `test_database_schema_correct()` - Schema validation

### Integration Tests (`integration-tests/`)

#### **tutorial-flow.test.js** - User Journey
- ✅ Authenticate test user
- ✅ Reset onboarding flag
- ✅ Simulate tutorial completion
- ✅ Verify backend updated
- ✅ Test persistence across requests
- ✅ Test signup with onboarding flag

#### **ota-validation.test.js** - OTA Updates
- ✅ Fetch updates from preview branch
- ✅ Verify runtime version (1.0.1)
- ✅ Check update timestamp
- ✅ Validate update message
- ✅ Confirm Android platform
- ✅ Verify GitHub Actions workflow exists

## 🔧 Configuration

### Backend Tests

Edit `backend-tests/conftest.py`:
```python
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://findable-production.up.railway.app')
TEST_USER = 'caitie690'
TEST_PASSWORD = os.environ.get('TEST_PASSWORD', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')
```

### Integration Tests

Edit test files directly:
```javascript
const BACKEND_HOST = process.env.BACKEND_URL?.replace('https://', '') || 'findable-production.up.railway.app';
const TEST_USER = 'caitie690';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
```

## 🤖 CI/CD (GitHub Actions)

### Triggers
- ✅ Push to `develop` or `main` branches
- ✅ Pull requests
- ✅ Scheduled hourly runs
- ✅ Manual workflow dispatch

### Workflow Steps
1. **Backend Tests**
   - Set up Python 3.11
   - Install dependencies (pytest, requests, psycopg2)
   - Run all backend tests
   - Upload results as artifacts

2. **Integration Tests**
   - Set up Node.js 18
   - Install dependencies (jest)
   - Run all integration tests
   - Upload results as artifacts

3. **Report Results**
   - Post test results as PR comments
   - Show status for each test suite
   - Link to full workflow run

### Required GitHub Secrets

Add these in: `Repository Settings → Secrets and variables → Actions`

```
BACKEND_URL: https://findable-production.up.railway.app
TEST_PASSWORD: (password for caitie690)
DATABASE_URL: postgresql://user:pass@railway.app:5432/railway
EXPO_TOKEN: (from Expo dashboard)
```

## 📈 What Each Test Validates

### Authentication Flow
```
POST /auth/login → JWT token → Protected endpoints work
```

### Profile Management
```
GET /user/profile → hasCompletedOnboarding field exists
POST /user/profile → Update hasCompletedOnboarding
GET /user/profile → Verify value persisted
```

### Database Persistence
```
API Update → Direct SQL Query → Verify database column value
```

### Tutorial Completion
```
Login → Reset flag → Complete tutorials → Backend updates → Verify persistence
```

### OTA Deployment
```
EAS GraphQL API → Fetch preview branch updates → Verify runtime version
```

## 🐛 Debugging Failed Tests

### Backend Tests Failing

**Login failed:**
- Check TEST_PASSWORD is correct
- Verify user `caitie690` exists in database
- Confirm backend URL is accessible

**Database tests failing:**
- Verify DATABASE_URL is correct
- Check PostgreSQL connection works: `psql $DATABASE_URL`
- Confirm `has_completed_onboarding` column exists

### Integration Tests Failing

**Connection errors:**
- Check BACKEND_URL environment variable
- Verify backend is running and accessible
- Test with curl: `curl https://findable-production.up.railway.app/health`

**EAS tests failing:**
- Check EXPO_TOKEN is valid
- Verify project ID is correct (@hirule/mobile)
- Confirm preview branch exists

## 📝 Test Output Examples

### Successful Run
```
backend-tests/test_auth.py::test_login_success PASSED
✓ Login successful for user caitie690 (ID: 123)

backend-tests/test_profile.py::test_profile_get PASSED
✓ Profile retrieved: hasCompletedOnboarding=true

backend-tests/test_persistence.py::test_onboarding_persists_in_database PASSED
✓ API update successful for user_id 123
✓ Database verification passed: has_completed_onboarding = 1

integration-tests/ota-validation.test.js
  ✓ should fetch updates from preview branch
  ✓ Found 3 updates on preview branch
  ✓ Runtime version matches: 1.0.1
```

### Failed Run
```
backend-tests/test_persistence.py::test_onboarding_persists_in_database FAILED
AssertionError: Expected 1 or True, got 0

integration-tests/tutorial-flow.test.js
  ✗ should verify backend updated correctly
  Expected: true
  Received: false
```

## 🎯 Success Criteria

All tests passing means:
- ✅ Backend authentication works
- ✅ Profile API endpoints functional
- ✅ hasCompletedOnboarding field saves to database
- ✅ Data persists across requests
- ✅ OTA updates published to preview branch
- ✅ Runtime version matches app version
- ✅ Tutorial completion flow works end-to-end

## 🔄 Continuous Monitoring

Tests run automatically:
- **Every push** to develop/main
- **Every PR** opened or updated
- **Every hour** via cron schedule
- **On demand** via workflow_dispatch

Results posted as PR comments and available in Actions tab.

---

**Built for production. No placeholders. Real tests. Real validation.** 🚀
