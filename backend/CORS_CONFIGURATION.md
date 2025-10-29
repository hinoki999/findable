# CORS Configuration - Droplin Backend

## Overview

Cross-Origin Resource Sharing (CORS) is configured to allow the React Native mobile app and local development environments to communicate securely with the backend API.

---

## Current Configuration

### Allowed Origins

```python
ALLOWED_ORIGINS = [
    # Development origins
    "http://localhost:8081",        # Local backend dev server
    "http://localhost:19006",       # Expo web interface
    "http://192.168.1.92:8081",    # Local network testing
]
```

### Origin Regex Pattern

```python
allow_origin_regex=r"^(http://localhost:\d+|http://192\.168\.\d+\.\d+:\d+)$"
```

**Matches:**
- `http://localhost:*` (any port)
- `http://192.168.*.*:*` (local network IPs with any port)

**Purpose:** Allows flexible local development without hardcoding every possible port.

---

## CORS Middleware Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `allow_origins` | Specific list | Explicitly allowed development origins |
| `allow_origin_regex` | Regex pattern | Dynamically allow local development origins |
| `allow_credentials` | `True` | Allow cookies/Authorization headers |
| `allow_methods` | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Restrict to needed HTTP methods |
| `allow_headers` | `["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"]` | Allow essential headers only |
| `expose_headers` | `["Content-Length", "Content-Type"]` | Headers accessible to client |
| `max_age` | `3600` | Cache preflight requests for 1 hour |

---

## React Native Considerations

### Origin Behavior

React Native apps have unique CORS behavior:

1. **Mobile App Requests** (iOS/Android):
   - May send `Origin: null` or no Origin header
   - Depends on the native HTTP client being used
   - FastAPI CORS middleware handles `null` origin appropriately

2. **Expo Web** (Browser):
   - Sends proper Origin headers like a web app
   - Requires explicit CORS configuration

3. **Local Testing**:
   - Development server origins must be allowed
   - Network IP addresses used for device testing

### Why Not `allow_origins=["*"]`?

Using wildcard origins (`["*"]`) is **insecure** because:

❌ Allows any website to access your API  
❌ Cannot use `allow_credentials=True` with wildcard  
❌ Exposes JWT tokens to malicious sites  
❌ No protection against CSRF attacks  

Our configuration is **secure** because:

✅ Only allows local development origins  
✅ Production mobile apps work (null origin handled)  
✅ Credentials/JWT tokens are protected  
✅ Preflight requests are cached for performance  

---

## Security Features

### 1. Restricted Origins

Only localhost and local network IPs are allowed. Production mobile apps don't send Origin headers, so they're unaffected by this restriction.

### 2. Explicit Method Whitelist

Only necessary HTTP methods are allowed:
- `GET` - Read data
- `POST` - Create data
- `PUT` - Update data (not currently used)
- `DELETE` - Delete data
- `OPTIONS` - Preflight requests

❌ Blocked: `PATCH`, `HEAD`, `CONNECT`, `TRACE`

### 3. Header Restrictions

**Allowed Request Headers:**
- `Authorization` - JWT tokens
- `Content-Type` - JSON payloads
- `Accept` - Response format
- `Origin` - CORS origin
- `X-Requested-With` - Ajax identifier

**Exposed Response Headers:**
- `Content-Length` - Response size
- `Content-Type` - Response format

### 4. Preflight Caching

`max_age=3600` tells browsers/clients to cache preflight OPTIONS requests for 1 hour, reducing overhead.

---

## Railway Production Deployment

### HTTPS Enforcement

Railway automatically provides HTTPS for your backend. The CORS configuration works seamlessly because:

1. **Mobile apps** access `https://findable-production.up.railway.app`
2. **No Origin header** is sent by native mobile apps
3. **CORS middleware** allows requests without Origin or with `null` Origin
4. **Security headers** enforce HTTPS via HSTS

### Testing Production CORS

**From Mobile App:**
```javascript
// This works - mobile apps don't send Origin headers
fetch('https://findable-production.up.railway.app/devices', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  }
})
```

**From Browser (will be blocked if not in ALLOWED_ORIGINS):**
```javascript
// This requires the origin to match ALLOWED_ORIGINS or allow_origin_regex
fetch('https://findable-production.up.railway.app/devices')
```

---

## Troubleshooting

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Cause:** Browser-based request from non-allowed origin

**Solution:**
1. If testing from browser, add the origin to `ALLOWED_ORIGINS`
2. If from mobile app, ensure you're using the correct URL
3. Check that request includes proper headers

### Issue: "Credentials flag is 'true', but 'Access-Control-Allow-Credentials' header is ''"

**Cause:** Using `allow_origins=["*"]` with `allow_credentials=True`

**Solution:** Already fixed - we use explicit origins, not wildcard

### Issue: Preflight request failing

**Check:**
1. Is `OPTIONS` in `allow_methods`? ✅ Yes
2. Are required headers in `allow_headers`? ✅ Yes
3. Is `max_age` set? ✅ Yes (3600)

---

## Local Development Setup

### If Using Different IP Address

Update `ALLOWED_ORIGINS` in `main.py`:

```python
ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:19006",
    "http://YOUR_IP_HERE:8081",  # Add your local network IP
]
```

The regex pattern `allow_origin_regex` should automatically handle most local IPs in the `192.168.*.*` range.

### If Using Different Port

The regex pattern allows any port on localhost and local network IPs, so no changes needed.

---

## Adding Production Web App (Future)

If you deploy a web frontend in the future:

```python
ALLOWED_ORIGINS = [
    # Development
    "http://localhost:8081",
    "http://localhost:19006",
    "http://192.168.1.92:8081",
    # Production web app
    "https://yourapp.com",
    "https://www.yourapp.com",
]
```

---

## Compliance

This CORS configuration follows security best practices:

✅ **OWASP CORS Security Cheat Sheet** - Restrict origins, use explicit lists  
✅ **RFC 6454 (Web Origin Concept)** - Proper origin validation  
✅ **OWASP Top 10 (A05:2021 Security Misconfiguration)** - Secure default config  

---

## References

- [FastAPI CORS Documentation](https://fastapi.tiangolo.com/tutorial/cors/)
- [OWASP CORS Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**Last Updated:** 2025-10-27  
**Status:** ✅ Production-Ready

