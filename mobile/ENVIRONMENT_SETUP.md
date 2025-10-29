# Environment Configuration Guide

## Quick Switch Between Development and Production

### Current Environment
Check the console output when the app starts:
```
🌍 API Environment: Production (Railway)
🔗 Base URL: https://findable-production.up.railway.app
```

---

## How to Switch Environments

### Option 1: Edit Configuration File (Recommended)

**File**: `mobile/src/config/environment.ts`

```typescript
// Change this line:
const CURRENT_ENV: Environment = 'production'; // ← Change this

// To:
const CURRENT_ENV: Environment = 'development'; // For local testing
```

### Option 2: Quick Reference

| Environment | Value | Base URL |
|-------------|-------|----------|
| **Local Testing** | `'development'` | `http://192.168.1.92:8081` |
| **Railway Production** | `'production'` | `https://findable-production.up.railway.app` |

---

## Development Environment (Local Backend)

**When to use**: Testing with local FastAPI backend

**Steps**:
1. Set `CURRENT_ENV = 'development'` in `environment.ts`
2. Make sure your local backend is running on `http://192.168.1.92:8081`
3. Restart Expo dev server: `npm start`
4. **Note**: HTTPS is NOT enforced in development mode

**Backend command** (run in backend folder):
```bash
uvicorn main:app --host 0.0.0.0 --port 8081 --reload
```

---

## Production Environment (Railway)

**When to use**: Testing with deployed Railway backend

**Steps**:
1. Set `CURRENT_ENV = 'production'` in `environment.ts`
2. Restart Expo dev server: `npm start`
3. **Note**: HTTPS is enforced in production mode

**Features in Production**:
- ✅ HTTPS enforcement
- ✅ Security headers validation
- ✅ Persistent PostgreSQL database
- ✅ Auto-retry on network errors

---

## Troubleshooting

### "Connection refused" in Development
- ✅ Check backend is running: `http://192.168.1.92:8081/health`
- ✅ Verify IP address matches your local machine
- ✅ Check firewall allows port 8081
- ✅ Ensure phone/emulator is on same network

### "Cannot connect" in Production
- ✅ Check Railway backend status
- ✅ Verify URL: `https://findable-production.up.railway.app/health`
- ✅ Check internet connection
- ✅ Look for Railway deployment errors

### App using wrong environment
- ✅ Restart Expo dev server after changing environment
- ✅ Clear Expo cache: `npx expo start --clear`
- ✅ Check console for "🌍 API Environment:" message

---

## Environment Configuration Details

### Development Mode
```typescript
{
  BASE_URL: 'http://192.168.1.92:8081',
  NAME: 'Development (Local)',
  ENFORCE_HTTPS: false,  // Allows HTTP for local testing
}
```

### Production Mode
```typescript
{
  BASE_URL: 'https://findable-production.up.railway.app',
  NAME: 'Production (Railway)',
  ENFORCE_HTTPS: true,   // Forces HTTPS for security
}
```

---

## Best Practices

1. **Always use `production` when testing final builds**
2. **Use `development` only when actively working on backend features**
3. **Commit with `production` mode** to avoid confusion
4. **Document any custom endpoints** in this file

---

## Changing Local IP Address

If your local machine IP changes, update `environment.ts`:

```typescript
development: {
  BASE_URL: 'http://YOUR_NEW_IP:8081',  // ← Update here
  // ...
}
```

To find your local IP:
- **Windows**: `ipconfig` (look for IPv4)
- **Mac/Linux**: `ifconfig` or `ip addr`
- **Use**: The IP from your WiFi/Ethernet adapter

---

## Future: Environment Variables

For more dynamic configuration, consider using:
- **Expo Constants**: `expo-constants` with `app.config.js`
- **Environment files**: `.env.development`, `.env.production`
- **Build-time configs**: Different builds for dev/prod

This would allow switching without editing code.

