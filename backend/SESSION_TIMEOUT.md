# Session Timeout & Activity Tracking - Droplin Backend

## Overview

Comprehensive session timeout system that automatically logs users out after periods of inactivity, with optional "Remember Me" feature for extended sessions.

---

## Features

✅ **Activity-based timeout** - Sessions expire after inactivity  
✅ **30-minute standard timeout** - Default inactivity limit  
✅ **30-day "Remember Me"** - Extended timeout for convenience  
✅ **Automatic session extension** - Activity resets the timeout  
✅ **Token refresh endpoint** - Update activity without re-login  
✅ **Security benefits** - Stolen phones can't access app forever  

---

## How It Works

### Session Lifecycle

```
[User Logs In]
   ↓
[Token Created with last_activity timestamp]
   ↓
[User Makes API Call]
   ↓
[Middleware Checks: time_since_activity < timeout?]
   ├─ YES → Request processed, session continues
   └─ NO → 401 Unauthorized, "Session expired due to inactivity"
         ↓
      [User Must Log In Again]
```

### Activity Tracking

Every JWT token contains:
```json
{
  "user_id": 1,
  "username": "john",
  "exp": 1730419200,  // Token expiration (30 days)
  "iat": 1727827200,  // Issued at timestamp
  "last_activity": 1727827200,  // Last activity timestamp
  "remember_me": false  // Timeout mode
}
```

**On Each API Request:**
1. Extract JWT token from `Authorization` header
2. Verify token signature and expiration
3. Check `last_activity` timestamp
4. Calculate: `time_since_activity = now - last_activity`
5. Compare with timeout: `time_since_activity > timeout?`
6. If exceeded → Reject with 401
7. If valid → Process request

---

## Configuration

### Timeout Settings

| Setting | Default | Environment Variable | Description |
|---------|---------|---------------------|-------------|
| **Standard Timeout** | 30 minutes | `ACTIVITY_TIMEOUT_MINUTES` | Inactivity timeout without "Remember Me" |
| **Remember Me Timeout** | 30 days | `REMEMBER_ME_TIMEOUT_DAYS` | Extended timeout with "Remember Me" enabled |
| **Token Expiration** | 30 days | `ACCESS_TOKEN_EXPIRE_DAYS` | Maximum token lifetime (regardless of activity) |

### Environment Variables

Add to `.env` file or Railway environment variables:

```env
# Activity timeout configuration
ACTIVITY_TIMEOUT_MINUTES=30  # Standard timeout (default: 30 minutes)
REMEMBER_ME_TIMEOUT_DAYS=30  # "Remember Me" timeout (default: 30 days)
ACCESS_TOKEN_EXPIRE_DAYS=30  # Maximum token lifetime (default: 30 days)
```

---

## API Changes

### 1. Login Endpoint (Updated)

**`POST /auth/login`**

**Request:**
```json
{
  "username": "john",
  "password": "MyPassword123!",
  "remember_me": false  // NEW: Optional, default false
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 1,
  "username": "john"
}
```

**Behavior:**
- `remember_me: false` → 30-minute inactivity timeout
- `remember_me: true` → 30-day inactivity timeout

---

### 2. Token Refresh Endpoint (Updated)

**`POST /auth/refresh`**

**Purpose:** Extend session by updating activity timestamp

**Request:**
```bash
curl -X POST https://your-backend.com/auth/refresh \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // New token with updated activity
  "user_id": 1,
  "username": "john"
}
```

**When to Call:**
- **Mobile App:** Every 5-10 minutes when app is active
- **Web App:** On page load, on user interaction
- **Background:** Not needed - only when user is active

---

### 3. Session Expiration Error

**All Protected Endpoints:**

If session has been inactive too long:

**Response: 401 Unauthorized**
```json
{
  "detail": "Session expired due to inactivity (timeout: 30 minutes). Please log in again."
}
```

Or with "Remember Me":
```json
{
  "detail": "Session expired due to inactivity (timeout: 30 days). Please log in again."
}
```

---

## Usage Scenarios

### Scenario 1: Normal Login (No Remember Me)

```
1. User logs in at 10:00 AM
   - remember_me: false
   - Token created with last_activity: 10:00 AM

2. User makes API call at 10:15 AM
   - Time since activity: 15 minutes
   - Within 30-minute timeout → ✅ Request succeeds
   - User should call /auth/refresh to update activity

3. User inactive from 10:15 AM to 10:50 AM (35 minutes)

4. User tries API call at 10:50 AM
   - Time since last activity: 35 minutes
   - Exceeds 30-minute timeout → ❌ 401 Unauthorized
   - User must log in again
```

---

### Scenario 2: "Remember Me" Login

```
1. User logs in at 10:00 AM on Jan 1
   - remember_me: true
   - Token created with last_activity: 10:00 AM Jan 1

2. User closes app, doesn't use for 20 days

3. User opens app on Jan 21 (20 days later)
   - Time since activity: 20 days
   - Within 30-day timeout → ✅ Still logged in
   - Session valid

4. User doesn't use app for 31 days

5. User opens app on Feb 1 (31 days later)
   - Time since activity: 31 days
   - Exceeds 30-day timeout → ❌ 401 Unauthorized
   - User must log in again
```

---

### Scenario 3: Active Session Extension

```
1. User logs in at 10:00 AM
   - remember_me: false (30-minute timeout)

2. App calls /auth/refresh every 10 minutes while user is active
   - 10:10 AM: Token refreshed, last_activity updated
   - 10:20 AM: Token refreshed, last_activity updated
   - 10:30 AM: Token refreshed, last_activity updated

3. User remains logged in as long as they're active
   - Session never expires due to inactivity
   - Each refresh resets the 30-minute timer

4. User stops using app at 10:35 AM

5. User tries to use app at 11:10 AM (35 minutes later)
   - Time since last activity: 35 minutes
   - Exceeds timeout → ❌ Must log in again
```

---

## Mobile App Integration

### 1. Login Screen - Add "Remember Me" Checkbox

```javascript
// LoginScreen.tsx
const [rememberMe, setRememberMe] = useState(false);

async function handleLogin() {
  const response = await secureFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      username, 
      password,
      remember_me: rememberMe  // Send remember_me flag
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    await saveToken(data.token);
    // Navigate to home
  }
}

// UI Component
<View>
  <Checkbox
    value={rememberMe}
    onValueChange={setRememberMe}
  />
  <Text>Keep me logged in (30 days)</Text>
</View>
```

---

### 2. Activity Tracker - Refresh Token Periodically

```javascript
// src/utils/activityTracker.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

let refreshInterval: NodeJS.Timeout | null = null;
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function startActivityTracking() {
  // Refresh token every 10 minutes to keep session alive
  refreshInterval = setInterval(async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;
      
      const response = await fetch('https://your-backend.com/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('auth_token', data.token);
        console.log('Session extended');
      } else if (response.status === 401) {
        // Session expired - log user out
        await handleSessionExpired();
      }
    } catch (error) {
      console.error('Activity refresh failed:', error);
    }
  }, REFRESH_INTERVAL);
}

export function stopActivityTracking() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function handleSessionExpired() {
  await AsyncStorage.removeItem('auth_token');
  // Navigate to login screen
  // Show message: "Your session has expired. Please log in again."
}
```

---

### 3. App Lifecycle - Start/Stop Tracking

```javascript
// App.tsx
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { startActivityTracking, stopActivityTracking } from './utils/activityTracker';

function App() {
  useEffect(() => {
    // Start activity tracking when app becomes active
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        startActivityTracking();
      } else {
        stopActivityTracking();
      }
    });
    
    // Start tracking immediately if app is active
    if (AppState.currentState === 'active') {
      startActivityTracking();
    }
    
    return () => {
      subscription.remove();
      stopActivityTracking();
    };
  }, []);
  
  return (
    // Your app content
  );
}
```

---

### 4. Handle Session Expiration

```javascript
// src/services/api.ts
export async function secureFetch(url: string, options: any = {}) {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    
    const response = await fetch(BASE_URL + url, options);
    
    // Handle session expiration
    if (response.status === 401) {
      const data = await response.json();
      
      if (data.detail?.includes('inactivity')) {
        // Session expired due to inactivity
        await AsyncStorage.removeItem('auth_token');
        
        Alert.alert(
          'Session Expired',
          'Your session has expired due to inactivity. Please log in again.',
          [
            { 
              text: 'Log In', 
              onPress: () => navigation.navigate('Login') 
            }
          ]
        );
        
        throw new Error('SESSION_EXPIRED');
      }
    }
    
    return response;
    
  } catch (error) {
    throw error;
  }
}
```

---

## Security Benefits

### Protection Against Stolen Devices

**Without Session Timeout:**
```
Day 1: Phone stolen
Day 30: Thief still has access to your account
Day 60: Thief still has access to your account
Day 90: Thief STILL has access to your account
```

**With Session Timeout (30 minutes):**
```
Day 1: Phone stolen at 10:00 AM
      Thief tries to access at 10:35 AM → ❌ Session expired
      Thief cannot access your account
```

**With Session Timeout (30 days "Remember Me"):**
```
Day 1: Phone stolen
Day 31: Session expires
      Thief cannot access your account anymore
```

### Real-World Scenarios

✅ **Lost/Stolen Phone:** Session expires after inactivity  
✅ **Public Computer:** Auto-logout prevents next person from accessing account  
✅ **Shared Device:** Session expires if you forget to log out  
✅ **Compromised Token:** Token becomes useless after timeout period  

---

## Best Practices

### For Users

✅ **Use "Remember Me"** only on personal devices  
❌ **Don't use "Remember Me"** on public/shared devices  
✅ **Log out manually** when done using public computers  
✅ **Enable device security** (PIN/biometric) for additional protection  

### For Developers

✅ **Call `/auth/refresh`** every 5-10 minutes when app is active  
✅ **Stop refresh timer** when app goes to background  
✅ **Handle 401 errors** gracefully with clear messaging  
✅ **Store tokens securely** (use secure storage, not plain AsyncStorage)  
✅ **Test timeout scenarios** before deploying  

---

## Testing

### Test Standard Timeout (30 minutes)

```bash
# 1. Login without remember_me
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "Test123!", "remember_me": false}'

# Save the token from response

# 2. Wait 31 minutes

# 3. Try to access protected endpoint
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 401 Unauthorized
# "Session expired due to inactivity (timeout: 30 minutes)"
```

### Test "Remember Me" Timeout (30 days)

```bash
# 1. Login with remember_me
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "Test123!", "remember_me": true}'

# 2. Wait 20 days (or test with shorter REMEMBER_ME_TIMEOUT_DAYS)

# 3. Access should still work
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 200 OK (session still valid)

# 4. Wait 31 days total

# 5. Access should fail
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 401 Unauthorized
# "Session expired due to inactivity (timeout: 30 days)"
```

### Test Token Refresh

```bash
# 1. Login
TOKEN=$(curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "Test123!"}' | jq -r '.token')

# 2. Refresh token (updates activity)
curl -X POST http://localhost:8081/auth/refresh \
  -H "Authorization: Bearer $TOKEN"

# Expected: New token with updated last_activity
```

---

## Configuration Examples

### Short Timeout for Testing

```env
# .env or Railway variables
ACTIVITY_TIMEOUT_MINUTES=5  # 5 minutes instead of 30
REMEMBER_ME_TIMEOUT_DAYS=1  # 1 day instead of 30
```

### Enterprise Settings

```env
# Stricter security
ACTIVITY_TIMEOUT_MINUTES=15  # 15 minutes
REMEMBER_ME_TIMEOUT_DAYS=7   # 1 week maximum
ACCESS_TOKEN_EXPIRE_DAYS=7   # Tokens expire after 1 week
```

### Relaxed Settings

```env
# More convenient
ACTIVITY_TIMEOUT_MINUTES=60  # 1 hour
REMEMBER_ME_TIMEOUT_DAYS=90  # 3 months
ACCESS_TOKEN_EXPIRE_DAYS=90  # Tokens valid for 3 months
```

---

## Troubleshooting

### Issue: "Session expired" immediately after login

**Cause:** Clock skew between server and client, or ACTIVITY_TIMEOUT_MINUTES set too low

**Fix:**
```env
# Increase timeout
ACTIVITY_TIMEOUT_MINUTES=30  # or higher
```

### Issue: Token refresh not working

**Cause:** Old token already expired or invalid

**Fix:**
- Ensure token is valid before calling /auth/refresh
- Handle 401 errors by redirecting to login

### Issue: Users getting logged out while actively using app

**Cause:** App not calling /auth/refresh frequently enough

**Fix:**
```javascript
// Reduce refresh interval
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes instead of 10
```

---

## Migration Guide

### Existing Users

Existing JWT tokens (without `last_activity`) will continue to work until they expire. On next login or token refresh, they'll receive new tokens with activity tracking.

**No database migration needed** - all changes are in JWT payload only.

---

## FAQ

**Q: Does every API call extend my session?**  
A: No. You must call `/auth/refresh` to extend the session. This prevents unnecessary token regeneration on every request.

**Q: What happens to "Remember Me" if I don't use the app for 31 days?**  
A: Session expires and you must log in again. This is intentional for security.

**Q: Can I change timeout settings per user?**  
A: Currently no, but you can implement user-specific timeouts by storing preferences in the database.

**Q: Will this break existing mobile app installations?**  
A: No. Existing tokens will work until they expire (30 days). Users will get new tokens with activity tracking on next login.

**Q: What if server clock is wrong?**  
A: Use UTC timestamps (datetime.utcnow()) to avoid timezone issues. Ensure server clock is synchronized with NTP.

---

**Last Updated:** 2025-10-27  
**Status:** ✅ Production-Ready with Session Timeout Protection

