# Error Monitoring Integration Guide

Step-by-step guide to integrate error monitoring into DropLink.

## Step 1: Add Backend Endpoints

**File: `backend/main.py`**

Add this near the top (after other imports):
```python
# Add error logging endpoints
from error_logging import router as error_logging_router
```

Add this after creating the FastAPI app (after `app = FastAPI()`):
```python
# Include error logging router
app.include_router(error_logging_router)
```

Add this to your database initialization (in startup event or migration):
```python
cursor.execute("""
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
""")
conn.commit()
```

## Step 2: Integrate Error Boundary in App.tsx

**File: `mobile/App.tsx`**

Add imports at the top:
```typescript
import { ErrorBoundary, errorLogger } from './src/utils/ErrorLogger';
import { performanceLogger } from './src/utils/PerformanceLogger';
import { bleErrorLogger } from './src/utils/BLEErrorLogger';
```

Wrap your app with ErrorBoundary and set user IDs:
```typescript
export default function App() {
  const { userId } = useAuth();

  // Update all loggers with user ID whenever it changes
  useEffect(() => {
    errorLogger.setUserId(userId);
    performanceLogger.setUserId(userId);
    bleErrorLogger.setUserId(userId);
  }, [userId]);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <DarkModeProvider>
            <TutorialProvider>
              <ToastProvider>
                <SafeAreaProvider>
                  <StatusBar style={isDarkMode ? 'light' : 'dark'} />
                  <MainApp />
                </SafeAreaProvider>
              </ToastProvider>
            </TutorialProvider>
          </DarkModeProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

## Step 3: Add Screen Tracking

**Example: `mobile/src/screens/HomeScreen.tsx`**

Add imports:
```typescript
import { performanceLogger } from '../utils/PerformanceLogger';
import { errorLogger } from '../utils/ErrorLogger';
import { usePerformanceLogger } from '../utils/PerformanceLogger';
```

Add tracking to component:
```typescript
export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { trackScreenLoad } = usePerformanceLogger();

  // Track screen load time
  useEffect(() => {
    errorLogger.setCurrentScreen('Home');
    const completeLoad = trackScreenLoad('Home');

    // Call completeLoad when screen is ready
    // For simple screens, can call immediately
    setTimeout(() => {
      completeLoad();
    }, 100);

    // Or wait for data to load
    // completeLoad(); // Call after data loads
  }, []);

  // Rest of your component...
}
```

**Apply to all screens:**
- HomeScreen.tsx
- AccountScreen.tsx
- HistoryScreen.tsx
- LinksScreen.tsx
- ProfilePhotoScreen.tsx
- SecuritySettingsScreen.tsx
- SignupScreen.tsx
- LoginScreen.tsx
- etc.

## Step 4: Track API Calls

**File: `mobile/src/services/api.ts`**

Wrap API calls with performance tracking:

```typescript
import { performanceLogger } from '../utils/PerformanceLogger';

// Example: getUserProfile with tracking
export async function getUserProfile(): Promise<UserProfile> {
  return await performanceLogger.trackApiCall('getUserProfile', async () => {
    if (USE_STUB) {
      await sleep(100);
      return { name: '', email: '', phone: '', bio: '' };
    }
    const headers = await getAuthHeaders();
    const res = await secureFetch(`${BASE_URL}/user/profile`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

// Example: saveUserProfile with tracking
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  return await performanceLogger.trackApiCall('saveUserProfile', async () => {
    if (USE_STUB) {
      await sleep(100);
      return;
    }
    const headers = await getAuthHeaders();
    const res = await secureFetch(`${BASE_URL}/user/profile`, {
      method: "POST",
      headers,
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}
```

**Wrap all existing API functions** in api.ts with `performanceLogger.trackApiCall()`.

## Step 5: Track Photo Uploads

**File: `mobile/src/services/api.ts`**

Update uploadProfilePhoto function:
```typescript
import { performanceLogger } from '../utils/PerformanceLogger';

export async function uploadProfilePhoto(imageUri: string): Promise<{ success: boolean; url: string }> {
  console.log('📸 Starting profile photo upload...');

  const uploadTracker = performanceLogger.trackPhotoUpload();
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  try {
    // ... existing upload code ...

    const result = await res.json();
    console.log('✅ Photo uploaded successfully:', result);

    uploadTracker.success(); // Track successful upload

    return {
      success: true,
      url: result.url || imageUri,
    };
  } catch (error: any) {
    console.error('❌ Upload error:', error);

    uploadTracker.failure(error.message); // Track failed upload

    // ... existing error handling ...
  }
}
```

## Step 6: Track BLE Operations

**File: `mobile/src/services/ble.ts`** (or wherever BLE code is)

Add imports:
```typescript
import { bleErrorLogger } from '../utils/BLEErrorLogger';
import { performanceLogger } from '../utils/PerformanceLogger';
```

**Track BLE initialization:**
```typescript
export async function initializeBLE() {
  try {
    // Your BLE initialization code
    await BleManager.start();
    console.log('✅ BLE initialized');
  } catch (error) {
    console.error('❌ BLE initialization failed:', error);
    bleErrorLogger.logInitializationError(error as Error);
    throw error;
  }
}
```

**Track BLE scanning:**
```typescript
export async function scanForDevices() {
  const scanTracker = performanceLogger.trackBLEScan();

  try {
    const devices = [];

    // Your BLE scanning code
    await BleManager.scan([], 30, false);

    // ... collect devices ...

    scanTracker.complete(devices.length);
    return devices;
  } catch (error) {
    console.error('❌ BLE scan failed:', error);
    bleErrorLogger.logScanError(error as Error);
    scanTracker.error((error as Error).message);
    throw error;
  }
}
```

**Track BLE permissions:**
```typescript
export async function requestBLEPermissions() {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
    );

    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      bleErrorLogger.logPermissionError('BLUETOOTH_SCAN', { granted });
      throw new Error('Bluetooth scan permission denied');
    }

    return true;
  } catch (error) {
    bleErrorLogger.logPermissionError('BLUETOOTH_SCAN', { error: (error as Error).message });
    throw error;
  }
}
```

## Step 7: Manual Error Logging

Use the error logger hook in any component for manual logging:

```typescript
import { useErrorLogger } from '../utils/ErrorLogger';

function MyComponent() {
  const { logError, logCustomError } = useErrorLogger();

  const handleAction = async () => {
    try {
      await someRiskyOperation();
    } catch (error) {
      // Log the error
      logError(error as Error, {
        context: 'handleAction',
        additionalInfo: 'User was doing X when this happened'
      });

      // Show error to user
      showToast({ message: 'Operation failed', type: 'error' });
    }
  };

  // Or log custom errors
  const handleCustomError = () => {
    logCustomError('User attempted invalid operation', {
      operation: 'deleteAllData',
      reason: 'No confirmation'
    });
  };

  return <View>...</View>;
}
```

## Step 8: Configure GitHub Secrets

Add these secrets to your GitHub repository:

1. Go to: https://github.com/hinoki999/findable/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret:

- **DATABASE_URL**
  - Get from Railway dashboard
  - Format: `postgresql://user:pass@host:port/database`

- **MONITOR_TEST_USERNAME**
  - Create a dedicated test account
  - Value: `monitor_test_user`

- **MONITOR_TEST_PASSWORD**
  - Strong password for test account
  - Value: `MonitorTest123!`

- **MONITOR_TEST_EMAIL**
  - Email for test account
  - Value: `monitor@test.com`

## Step 9: Deploy

**Deploy backend:**
```bash
cd C:\Users\caiti\Documents\droplin
git add backend/
git commit -m "Add error collection endpoints"
git push origin develop
```

Wait for Railway to deploy (~2-3 minutes).

**Deploy frontend:**
```bash
git add mobile/src/utils/
git add mobile/App.tsx
git commit -m "Add error monitoring integration"
git push origin develop

cd mobile
npx eas update --branch preview --message "Add error monitoring"
```

**Enable GitHub Actions:**
```bash
git add monitoring/
git add .github/workflows/error-monitoring.yml
git commit -m "Add error monitoring system"
git push origin develop
```

## Step 10: Test

**Test error logging:**
1. Open the app
2. Cause an error (e.g., tap something that crashes)
3. Check Railway logs: `railway logs`
4. Check database: `railway connect postgres` → `SELECT * FROM errors;`

**Test performance logging:**
1. Navigate to different screens
2. Check database: `SELECT * FROM performance_metrics ORDER BY timestamp DESC LIMIT 10;`

**Test BLE logging:**
1. Try to use BLE features
2. Check database: `SELECT * FROM ble_errors;`

**Test monitoring:**
1. Go to GitHub → Actions
2. Click "Error Monitoring System"
3. Click "Run workflow"
4. Wait for jobs to complete
5. Check for any GitHub issues created

## Step 11: Monitor

**Check monitoring status:**
- GitHub Actions runs every 5 minutes
- Check Actions tab for failures
- Check Issues tab for automatically created issues

**Query error data:**
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
GROUP BY metric_name
ORDER BY AVG(duration_ms) DESC;

# BLE errors
SELECT error_type, COUNT(*)
FROM ble_errors
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY error_type;
```

## Troubleshooting

**Errors not being logged:**
- Check backend endpoints exist: `curl https://findable-production.up.railway.app/api/log-error`
- Check tables exist in database
- Check mobile app console for error logger messages
- Check Railway logs for incoming requests

**Monitors not running:**
- Check GitHub Actions is enabled
- Check secrets are configured
- Check workflow file syntax
- Check Actions tab for error messages

**Too many GitHub issues:**
- Monitors deduplicate by hour
- Consider raising thresholds
- Consider increasing check intervals

---

After completing these steps, your error monitoring system will be fully operational!
