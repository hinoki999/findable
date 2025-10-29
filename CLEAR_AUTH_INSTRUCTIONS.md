# How to Clear Stored Authentication

## The Problem
Your app automatically logs you in with an old account because the JWT token is stored in browser localStorage/app storage and hasn't expired yet (tokens last 30 days).

## Solutions

### Option 1: Clear Browser Storage (Web/Localhost)

**In Chrome/Edge:**
1. Open your app: `http://localhost:19006`
2. Press `F12` to open DevTools
3. Go to **Application** tab
4. Click **Local Storage** → `http://localhost:19006`
5. Delete these keys:
   - `authToken`
   - `userId`
   - `username`
6. Refresh the page

**Or clear all localStorage in console:**
```javascript
localStorage.clear()
location.reload()
```

### Option 2: Add Logout Button (Best Solution)

You should have a logout button in your app! Check if you're using it.

### Option 3: Clear App Data (Mobile/Expo)

**For Expo Go:**
1. Close the app completely
2. Reopen Expo Go
3. Shake device → **Clear app data**

**For iOS Simulator:**
1. Device → Erase All Content and Settings

**For Android Emulator:**
1. Settings → Apps → Your App → Clear Data

### Option 4: Test in Incognito/Private Window

**For Web Testing:**
- Open `http://localhost:19006` in incognito mode
- No stored tokens = fresh start every time

## Prevention

### Add This to Your App for Easy Testing

You could add a hidden "Force Logout" button for development:

```typescript
// In your app, press a hidden area 5 times to force logout
import AsyncStorage from '@react-native-async-storage/async-storage';

const clearAllAuth = async () => {
  await AsyncStorage.multiRemove(['authToken', 'userId', 'username']);
  // Reload app
};
```

## Why This Happens

- JWT tokens expire after 30 days
- Tokens are stored persistently for auto-login
- Unless you explicitly logout, the token stays valid
- This is **normal behavior** for most apps!

## Quick Fix for Right Now

**Open browser console (F12) and run:**
```javascript
localStorage.removeItem('authToken')
localStorage.removeItem('userId')
localStorage.removeItem('username')
location.reload()
```

Done! You'll be logged out and can start fresh.

