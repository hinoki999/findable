# JWT Authentication Testing Guide

## Quick Validation Steps

### Step 1: Create a Test Account

```bash
# Register a new user
curl -X POST https://findable-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser123",
    "password": "TestPass123!",
    "email": "test@example.com"
  }'
```

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 1,
  "username": "testuser123"
}
```

**Copy the `token` value - you'll need it for the next steps!**

---

### Step 2: Test WITHOUT Token (Should FAIL)

```bash
# Try to get devices without authentication
curl https://findable-production.up.railway.app/devices
```

**Expected Response: ❌ 401 Error**
```json
{
  "detail": "Not authenticated"
}
```

---

### Step 3: Test WITH Token (Should WORK)

```bash
# Replace YOUR_TOKEN_HERE with the token from Step 1
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     https://findable-production.up.railway.app/devices
```

**Expected Response: ✅ 200 OK**
```json
[]
```
(Empty array since you have no devices yet)

---

### Step 4: Test Creating a Device WITH Token

```bash
# Replace YOUR_TOKEN_HERE with your token
curl -X POST https://findable-production.up.railway.app/devices \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Device",
    "rssi": -50,
    "distance": 10.5,
    "action": "dropped"
  }'
```

**Expected Response: ✅ 200 OK**
```json
{
  "id": 1,
  "name": "Test Device",
  "rssi": -50,
  "distanceFeet": 10.5,
  "action": "dropped",
  ...
}
```

**Notice:** No `user_id` in the request body - it comes from the JWT token!

---

### Step 5: Test User Profile WITH Token

```bash
# Get your profile
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     https://findable-production.up.railway.app/user/profile
```

**Expected Response: ✅ 200 OK**
```json
{
  "name": "",
  "email": "test@example.com",
  "phone": "",
  "bio": "",
  "profile_photo": null,
  "socialMedia": []
}
```

---

### Step 6: Test Invalid Token (Should FAIL)

```bash
# Try with a fake token
curl -H "Authorization: Bearer fake_invalid_token_12345" \
     https://findable-production.up.railway.app/devices
```

**Expected Response: ❌ 401 Error**
```json
{
  "detail": "Invalid token"
}
```

---

### Step 7: Test Expired Token (Should FAIL)

JWT tokens expire after 30 days. To test:

```bash
# Use a token from a really old account
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InRlc3QiLCJleHAiOjE2MDAwMDAwMDB9.fake" \
     https://findable-production.up.railway.app/devices
```

**Expected Response: ❌ 401 Error**
```json
{
  "detail": "Token has expired"
}
```

---

## Method 2: Test in Your Mobile App

### Check Network Tab

1. Open your mobile app
2. Open React Native Debugger or Chrome DevTools
3. Go to Network tab
4. Perform any action (get devices, update profile, etc.)
5. Check the request headers

**Should see:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Method 3: Python Test Script

Save this as `test_jwt.py`:

```python
import requests
import json

BASE_URL = "https://findable-production.up.railway.app"

def test_jwt_auth():
    print("🧪 Testing JWT Authentication\n")
    
    # Step 1: Register
    print("1️⃣  Registering test user...")
    register_data = {
        "username": "testjwt123",
        "password": "TestPass123!",
        "email": "testjwt@example.com"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        if response.status_code == 200:
            data = response.json()
            token = data['token']
            user_id = data['user_id']
            print(f"✅ Registration successful!")
            print(f"   User ID: {user_id}")
            print(f"   Token (first 50 chars): {token[:50]}...\n")
        else:
            print(f"❌ Registration failed: {response.text}")
            return
    except Exception as e:
        print(f"❌ Error: {e}")
        return
    
    # Step 2: Test WITHOUT token
    print("2️⃣  Testing /devices WITHOUT token...")
    response = requests.get(f"{BASE_URL}/devices")
    if response.status_code == 401:
        print(f"✅ Correctly rejected: {response.json()['detail']}\n")
    else:
        print(f"❌ Should have been rejected but got: {response.status_code}\n")
    
    # Step 3: Test WITH valid token
    print("3️⃣  Testing /devices WITH valid token...")
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/devices", headers=headers)
    if response.status_code == 200:
        print(f"✅ Successfully authenticated!\n")
    else:
        print(f"❌ Failed: {response.text}\n")
    
    # Step 4: Test WITH invalid token
    print("4️⃣  Testing WITH invalid token...")
    bad_headers = {"Authorization": "Bearer invalid_token_12345"}
    response = requests.get(f"{BASE_URL}/devices", headers=bad_headers)
    if response.status_code == 401:
        print(f"✅ Correctly rejected: {response.json()['detail']}\n")
    else:
        print(f"❌ Should have been rejected but got: {response.status_code}\n")
    
    # Step 5: Create a device
    print("5️⃣  Creating a device WITH token...")
    device_data = {
        "name": "Test Device",
        "rssi": -50,
        "distance": 10.5,
        "action": "dropped"
    }
    response = requests.post(f"{BASE_URL}/devices", json=device_data, headers=headers)
    if response.status_code == 200:
        print(f"✅ Device created successfully!\n")
        print(f"   {response.json()}\n")
    else:
        print(f"❌ Failed: {response.text}\n")
    
    # Step 6: Get user profile
    print("6️⃣  Getting user profile WITH token...")
    response = requests.get(f"{BASE_URL}/user/profile", headers=headers)
    if response.status_code == 200:
        print(f"✅ Profile retrieved successfully!\n")
        print(f"   {json.dumps(response.json(), indent=2)}\n")
    else:
        print(f"❌ Failed: {response.text}\n")
    
    print("✅ All JWT tests completed!")

if __name__ == "__main__":
    test_jwt_auth()
```

**Run it:**
```bash
pip install requests
python test_jwt.py
```

---

## Method 4: Check Railway Logs

1. Go to Railway dashboard
2. Click your backend service
3. Click "Deployments" → Latest deployment
4. Look for authentication attempts in logs

**Successful auth:**
```
INFO: 10.0.0.1:12345 - "GET /devices HTTP/1.1" 200 OK
```

**Failed auth:**
```
INFO: 10.0.0.1:12345 - "GET /devices HTTP/1.1" 401 Unauthorized
```

---

## Method 5: Browser DevTools (for Web Testing)

1. Open your app in browser
2. Press F12 → Network tab
3. Perform any action (load devices, etc.)
4. Click the request
5. Check **Request Headers**

**Should see:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

6. Check **Response**

**If 401:**
```json
{"detail": "Not authenticated"}
```

**If 200:**
```json
[...your data...]
```

---

## Validation Checklist

### ✅ JWT is Working If:

- [ ] `/auth/register` returns a token
- [ ] `/auth/login` returns a token
- [ ] Requests WITHOUT token get **401 Unauthorized**
- [ ] Requests WITH valid token get **200 OK**
- [ ] Requests WITH invalid token get **401 Unauthorized**
- [ ] User can only access their OWN devices
- [ ] User can only delete their OWN devices
- [ ] User can only access their OWN profile
- [ ] Creating devices doesn't require `user_id` in body
- [ ] Token persists across app restarts
- [ ] Token works after Railway redeploy

### ❌ JWT is NOT Working If:

- [ ] Any endpoint works WITHOUT a token
- [ ] Users can access other users' devices
- [ ] Invalid tokens are accepted
- [ ] Token is required for `/auth/*` routes (should be public)
- [ ] 500 errors instead of 401 errors

---

## Common Issues & Fixes

### Issue: "Not authenticated" on every request

**Cause:** Token not being sent in Authorization header

**Fix:** Check mobile app sends token:
```typescript
const headers = await getAuthHeaders();
// Should include: Authorization: Bearer <token>
```

---

### Issue: "Invalid token" immediately after login

**Cause:** Token format issue

**Fix:** Check token is stored correctly:
```typescript
// Mobile app should store:
await SecureStore.setItemAsync('authToken', token);

// And retrieve:
const token = await SecureStore.getItemAsync('authToken');
headers['Authorization'] = `Bearer ${token}`;
```

---

### Issue: Token works locally but not on Railway

**Cause:** Different SECRET_KEY between environments

**Fix:** Use same SECRET_KEY (set as environment variable in Railway)

---

## Quick Test Command (Copy & Paste)

Replace `YOUR_RAILWAY_URL` with your Railway URL:

```bash
# All-in-one test
TOKEN=$(curl -s -X POST https://findable-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"quicktest'$(date +%s)'","password":"Test123!","email":"test@test.com"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4) && \
echo "Token: $TOKEN" && \
echo "\nTesting WITHOUT token:" && \
curl -s https://findable-production.up.railway.app/devices && \
echo "\n\nTesting WITH token:" && \
curl -s -H "Authorization: Bearer $TOKEN" https://findable-production.up.railway.app/devices
```

---

## Expected Results

**✅ Working JWT:**
- First curl (no token): `{"detail":"Not authenticated"}`
- Second curl (with token): `[]` or `[...devices...]`

**❌ Broken JWT:**
- First curl (no token): `[]` or `[...devices...]` ← Should be 401!
- Second curl (with token): Error

---

Your JWT authentication is fully implemented and deployed! 🔒✅

