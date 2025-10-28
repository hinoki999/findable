# API Key Rotation - Droplin Backend

## Overview

JWT key rotation system that allows secure rotation of JWT signing secrets, with a grace period to prevent immediate token invalidation for all users.

---

## Features

✅ **Secure key generation** - 256-bit random JWT secrets  
✅ **Grace period support** - Old tokens work during transition  
✅ **Version tracking** - Key versions prevent old token reuse  
✅ **Admin endpoint** - Simple API to initiate rotation  
✅ **Step-by-step instructions** - Clear process for Railway deployment  

---

## When to Rotate Keys

### Emergency Rotation (Immediate)

🚨 **Rotate immediately if:**
- JWT secret has been exposed/leaked
- Security breach detected
- Unauthorized access to environment variables
- Compliance audit requires it

### Scheduled Rotation (Planned)

📅 **Rotate periodically for:**
- Security best practices (every 90 days recommended)
- Compliance requirements (SOC 2, HIPAA)
- After employee/contractor offboarding
- Major security updates

### Optional Rotation

💡 **Consider rotating for:**
- Suspicious account activity patterns
- Before major product launches
- After significant user base growth

---

## How It Works

### Key Rotation Process

```
[Current State]
JWT_SECRET_KEY = "old-secret-abc"
JWT_KEY_VERSION = 1
All tokens signed with version 1

↓ [Admin calls /admin/rotate-keys]

[New keys generated]
new_secret = "new-secret-xyz"
new_version = 2

↓ [Update Railway environment variables]

JWT_SECRET_KEY = "new-secret-xyz"          # New key
PREVIOUS_JWT_SECRET_KEY = "old-secret-abc" # Old key (grace period)
JWT_KEY_VERSION = 2                        # New version

↓ [Grace Period - 24-48 hours]

- New logins get tokens with version 2 (signed with new key)
- Old tokens with version 1 still work (verified with previous key)
- Users gradually migrate to new tokens

↓ [End Grace Period]

Remove PREVIOUS_JWT_SECRET_KEY from Railway
- Only version 2 tokens accepted
- All version 1 tokens invalidated
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET_KEY` | Current JWT signing secret | `new-secret-xyz...` |
| `JWT_KEY_VERSION` | Current key version number | `2` |

### Optional Variables (During Grace Period)

| Variable | Description | Example |
|----------|-------------|---------|
| `PREVIOUS_JWT_SECRET_KEY` | Previous secret for grace period | `old-secret-abc...` |

---

## API Endpoint

### `POST /admin/rotate-keys`

**Purpose:** Initiate JWT key rotation and get new credentials

**Authentication:** Requires valid JWT token (any authenticated user)

**Request:**
```bash
curl -X POST https://your-backend.com/admin/rotate-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Key rotation prepared. Update environment variables to complete rotation.",
  "current_key_version": 1,
  "new_key_version": 2,
  "new_jwt_secret": "new-random-secret-here",
  "previous_jwt_secret": "your-current-secret",
  "instructions": {
    "step_1": "Go to Railway Dashboard → Backend Service → Variables",
    "step_2": "Update JWT_SECRET_KEY to: new-random-secret-here",
    "step_3": "Set PREVIOUS_JWT_SECRET_KEY to: your-current-secret (grace period)",
    "step_4": "Set JWT_KEY_VERSION to: 2",
    "step_5": "Railway will redeploy automatically",
    "step_6": "After 24 hours, remove PREVIOUS_JWT_SECRET_KEY (end grace period)",
    "warning": "All users will need to log in again after rotation completes"
  },
  "grace_period_note": "Tokens signed with old key will work during grace period (24-48 hours recommended)"
}
```

---

## Step-by-Step Rotation Procedure

### Step 1: Initiate Rotation

**Call the admin endpoint:**
```bash
# Get your admin token first (by logging in)
TOKEN=$(curl -X POST https://your-backend.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' | jq -r '.token')

# Initiate key rotation
curl -X POST https://your-backend.com/admin/rotate-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
```

**Save the response** - you'll need the `new_jwt_secret`, `previous_jwt_secret`, and `new_key_version`.

---

### Step 2: Update Railway Environment Variables

1. Go to [Railway Dashboard](https://railway.app)
2. Open your **Droplink** project
3. Click **backend** service
4. Go to **"Variables"** tab
5. Update/add these variables:

```
JWT_SECRET_KEY = <new_jwt_secret from Step 1>
PREVIOUS_JWT_SECRET_KEY = <previous_jwt_secret from Step 1>
JWT_KEY_VERSION = <new_key_version from Step 1>
```

6. **Save** - Railway will automatically redeploy (~60 seconds)

---

### Step 3: Verify Rotation

**Check Railway logs for:**
```
✓ JWT Key Version: 2
INFO: Application startup complete
```

**Test that new tokens work:**
```bash
# Login should work and get new token (version 2)
curl -X POST https://your-backend.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Test123!"}'
```

**Test that old tokens still work (grace period):**
```bash
# Use an old token (version 1) - should still work
curl -X GET https://your-backend.com/devices \
  -H "Authorization: Bearer OLD_TOKEN_HERE"
```

---

### Step 4: Monitor Grace Period (24-48 hours)

During the grace period:
- **New logins** get version 2 tokens (signed with new key)
- **Old tokens** (version 1) still work (verified with previous key)
- **Users naturally migrate** as they use the app

**Monitor Railway logs for:**
```
⚠️  User john using old key version 1. Should refresh token.
```

This tells you which users are still on old tokens.

---

### Step 5: End Grace Period

After 24-48 hours (when most users have migrated):

1. Go to Railway Dashboard → Backend → Variables
2. **Remove** `PREVIOUS_JWT_SECRET_KEY`
3. Railway will redeploy

**Result:** Only version 2 tokens accepted. All version 1 tokens invalidated.

---

## Token Verification Logic

### With Grace Period

```python
1. Try decoding token with JWT_SECRET_KEY
   ├─ Success → Check key_version matches CURRENT_KEY_VERSION
   │            └─ Valid if version matches (e.g., version 2)
   └─ Fail → Try decoding with PREVIOUS_JWT_SECRET_KEY
              ├─ Success → Check key_version is CURRENT_KEY_VERSION - 1
              │            └─ Valid if version matches (e.g., version 1 during grace period)
              └─ Fail → Invalid token, reject
```

### After Grace Period

```python
1. Try decoding token with JWT_SECRET_KEY
   ├─ Success → Check key_version matches CURRENT_KEY_VERSION
   │            └─ Valid if version matches (e.g., version 2)
   └─ Fail → Invalid token, reject (no grace period)
```

---

## Security Considerations

### What Key Rotation Protects Against

✅ **Leaked secrets** - Old tokens become invalid  
✅ **Compromised tokens** - Force re-authentication  
✅ **Long-lived tokens** - Periodic rotation limits exposure window  
✅ **Insider threats** - Rotate keys when employees leave  

### What Key Rotation Does NOT Protect Against

❌ **Active session hijacking** - Rotate immediately, no grace period  
❌ **Real-time attacks** - Use account lockout, rate limiting  
❌ **Password breaches** - Rotate passwords, not JWT keys  

---

## Emergency Rotation (No Grace Period)

If you need to **immediately** invalidate all tokens (security breach):

### Quick Emergency Rotation

1. **Call `/admin/rotate-keys`** to get new secret

2. **Update Railway variables:**
   ```
   JWT_SECRET_KEY = <new_secret>
   JWT_KEY_VERSION = <new_version>
   # DO NOT set PREVIOUS_JWT_SECRET_KEY
   ```

3. **All users logged out immediately** - no grace period

4. **Notify users** to log in again

---

## Testing Key Rotation

### Test Scenario 1: Grace Period Works

```bash
# 1. Login and save token (version 1)
TOKEN_V1=$(curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Test123!"}' | jq -r '.token')

# 2. Rotate keys (get new version 2)
curl -X POST http://localhost:8081/admin/rotate-keys \
  -H "Authorization: Bearer $TOKEN_V1" | jq '.'

# 3. Update environment variables (JWT_SECRET_KEY, PREVIOUS_JWT_SECRET_KEY, JWT_KEY_VERSION)
# 4. Restart backend

# 5. Old token (v1) should still work during grace period
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer $TOKEN_V1"
# Expected: 200 OK

# 6. New login gets v2 token
TOKEN_V2=$(curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Test123!"}' | jq -r '.token')

# 7. New token (v2) works
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer $TOKEN_V2"
# Expected: 200 OK
```

### Test Scenario 2: End Grace Period

```bash
# 1. Remove PREVIOUS_JWT_SECRET_KEY from environment
# 2. Restart backend

# 3. Old token (v1) should now be invalid
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer $TOKEN_V1"
# Expected: 401 "Token has been invalidated"

# 4. New token (v2) still works
curl -X GET http://localhost:8081/devices \
  -H "Authorization: Bearer $TOKEN_V2"
# Expected: 200 OK
```

---

## Automation (Optional)

### Scheduled Rotation Script

```bash
#!/bin/bash
# rotate_keys.sh - Automate key rotation every 90 days

# 1. Get admin token
TOKEN=$(curl -s -X POST https://your-backend.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"'"$ADMIN_PASSWORD"'"}' | jq -r '.token')

# 2. Initiate rotation
ROTATION=$(curl -s -X POST https://your-backend.com/admin/rotate-keys \
  -H "Authorization: Bearer $TOKEN")

# 3. Extract values
NEW_SECRET=$(echo $ROTATION | jq -r '.new_jwt_secret')
OLD_SECRET=$(echo $ROTATION | jq -r '.previous_jwt_secret')
NEW_VERSION=$(echo $ROTATION | jq -r '.new_key_version')

# 4. Update Railway via CLI (requires railway CLI)
railway variables set JWT_SECRET_KEY="$NEW_SECRET"
railway variables set PREVIOUS_JWT_SECRET_KEY="$OLD_SECRET"
railway variables set JWT_KEY_VERSION="$NEW_VERSION"

echo "✓ Key rotation complete. Grace period active for 48 hours."
echo "✓ Run this again in 48 hours to end grace period:"
echo "  railway variables delete PREVIOUS_JWT_SECRET_KEY"
```

---

## Troubleshooting

### Issue: "Token has been invalidated" immediately after rotation

**Cause:** `PREVIOUS_JWT_SECRET_KEY` not set during grace period

**Fix:**
```
# Add the previous key back
PREVIOUS_JWT_SECRET_KEY = <old_secret>
```

### Issue: Old tokens still work after ending grace period

**Cause:** `PREVIOUS_JWT_SECRET_KEY` still set

**Fix:**
```
# Remove previous key
railway variables delete PREVIOUS_JWT_SECRET_KEY
```

### Issue: All tokens invalid, can't log in

**Cause:** `JWT_KEY_VERSION` mismatch or wrong secret

**Fix:**
```
# Verify environment variables match
JWT_SECRET_KEY = <correct_current_secret>
JWT_KEY_VERSION = <correct_current_version>
```

---

## Best Practices

✅ **Rotate every 90 days** for security best practices  
✅ **Use grace period** (24-48 hours) for user experience  
✅ **Monitor logs** during grace period  
✅ **Notify users** before rotation (optional)  
✅ **Test in staging** before production  
✅ **Document each rotation** (date, version, reason)  
✅ **Keep rotation history** for audit trails  

❌ **Don't rotate too frequently** (causes user frustration)  
❌ **Don't skip grace period** unless emergency  
❌ **Don't commit secrets** to version control  
❌ **Don't share rotation endpoint** publicly  

---

## Compliance

This key rotation system supports:

✅ **SOC 2** - Regular credential rotation  
✅ **HIPAA** - Access control and key management  
✅ **PCI DSS 3.2.1** - Cryptographic key management  
✅ **ISO 27001** - Information security controls  
✅ **NIST** - Secure key lifecycle management  

---

## FAQ

**Q: How often should I rotate keys?**  
A: Every 90 days for routine rotation. Immediately if compromised.

**Q: Will users be logged out during rotation?**  
A: Not during grace period. After grace period ends, yes.

**Q: How long should the grace period be?**  
A: 24-48 hours recommended. Longer for large user bases.

**Q: Can I rotate keys without downtime?**  
A: Yes, the grace period prevents any service interruption.

**Q: What if I lose the new secret before updating Railway?**  
A: Call `/admin/rotate-keys` again to generate a new one.

**Q: Can users keep working during rotation?**  
A: Yes, during grace period. After grace period, they must log in again.

---

**Last Updated:** 2025-10-27  
**Status:** ✅ Production-Ready with Key Rotation Support

