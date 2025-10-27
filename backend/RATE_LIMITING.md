# Rate Limiting Implementation

## Overview
Rate limiting has been added to all authentication endpoints to prevent abuse and brute force attacks.

## Implementation Details

### Library Used
- **slowapi v0.1.9** - FastAPI rate limiting library
- Based on Flask-Limiter
- Uses IP address as the key for rate limiting

### Protected Endpoints

#### 1. `/auth/register`
- **Rate Limit**: 3 requests per hour per IP
- **Purpose**: Prevent mass account creation
- **Response on limit**: 429 Too Many Requests

#### 2. `/auth/login`
- **Rate Limit**: 5 requests per minute per IP
- **Purpose**: Prevent brute force password attacks
- **Response on limit**: 429 Too Many Requests

#### 3. `/auth/refresh`
- **Rate Limit**: 10 requests per minute per IP
- **Purpose**: Prevent token refresh abuse
- **Response on limit**: 429 Too Many Requests

## Error Response Format

When rate limit is exceeded, the API returns:

```json
{
  "error": "Too Many Requests",
  "message": "Too many login attempts. Please try again in 1 minute.",
  "limit": "5 login attempts per minute per IP address",
  "retry_after": 60
}
```

### Response Headers

All rate-limited responses include:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1730000000
Retry-After: 60
```

## Header Definitions

- **X-RateLimit-Limit**: Maximum number of requests allowed
- **X-RateLimit-Remaining**: Number of requests remaining (0 when exceeded)
- **X-RateLimit-Reset**: Unix timestamp when the limit resets
- **Retry-After**: Seconds to wait before retrying

## Testing Rate Limits

### Test /auth/register (3/hour)

```bash
# Try to register 4 times in a row
for i in {1..4}; do
  curl -X POST https://findable-production.up.railway.app/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"test$i\",\"password\":\"TestPass123!\",\"email\":\"test$i@test.com\"}"
  echo ""
done
```

**Expected**: First 3 succeed, 4th returns 429

### Test /auth/login (5/minute)

```bash
# Try to login 6 times in a row
for i in {1..6}; do
  curl -X POST https://findable-production.up.railway.app/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"test\",\"password\":\"wrong\"}"
  echo ""
done
```

**Expected**: First 5 return 401 (wrong password), 6th returns 429

### Test /auth/refresh (10/minute)

```bash
# First, get a valid token
TOKEN=$(curl -X POST https://findable-production.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"youruser","password":"yourpass"}' | jq -r '.token')

# Try to refresh 11 times
for i in {1..11}; do
  curl -X POST https://findable-production.up.railway.app/auth/refresh \
    -H "Authorization: Bearer $TOKEN"
  echo ""
done
```

**Expected**: First 10 succeed, 11th returns 429

## Configuration

### Changing Rate Limits

To modify rate limits, edit `backend/main.py`:

```python
# Registration: 3 per hour
@limiter.limit("3/hour")

# Login: 5 per minute
@limiter.limit("5/minute")

# Refresh: 10 per minute
@limiter.limit("10/minute")
```

### Rate Limit Syntax

```python
@limiter.limit("X/unit")
```

**Units**:
- `second`, `minute`, `hour`, `day`
- `10/second` = 10 requests per second
- `100/hour` = 100 requests per hour

### Adding Rate Limits to Other Endpoints

```python
@app.post("/your-endpoint")
@limiter.limit("20/minute")
def your_endpoint(req: Request, ...):
    # Must include Request parameter
    ...
```

## Benefits

### Security
- ✅ Prevents brute force attacks on login
- ✅ Prevents mass account creation
- ✅ Protects against DOS attacks
- ✅ Reduces server load from malicious actors

### User Experience
- ✅ Clear error messages
- ✅ Tells users when they can retry
- ✅ Doesn't affect normal usage patterns
- ✅ Headers help clients implement retry logic

## Production Considerations

### Current Implementation (IP-Based)
- **Pros**: Simple, no configuration needed
- **Cons**: Entire network shares the same limit if behind NAT

### Future Improvements

1. **User-Based Rate Limiting**
   ```python
   def get_user_id(request: Request):
       token = request.headers.get("Authorization", "").replace("Bearer ", "")
       # Extract user_id from token
       return user_id
   
   limiter = Limiter(key_func=get_user_id)
   ```

2. **Redis Backend**
   ```python
   from slowapi import Limiter
   from slowapi.util import get_remote_address
   
   limiter = Limiter(
       key_func=get_remote_address,
       storage_uri="redis://localhost:6379"
   )
   ```

3. **Different Limits for Authenticated Users**
   ```python
   @limiter.limit("10/minute", per_method=True)  # Authenticated
   @limiter.limit("3/minute", per_method=True)   # Unauthenticated
   def endpoint(req: Request):
       ...
   ```

## Monitoring

### Check Rate Limit Status in Logs

Railway logs will show:
```
INFO: 100.64.0.4:20508 - "POST /auth/login HTTP/1.1" 429 Too Many Requests
```

### Track Rate Limit Violations

In production, you may want to log:
- IP addresses hitting limits
- Frequency of 429 responses
- Patterns indicating attacks

## Deployment Status

✅ **DEPLOYED**: Rate limiting is now active on Railway
- Changes automatically deployed via git push
- All authentication endpoints protected
- Custom error messages and headers included

## Testing on Railway

**Live URL**: `https://findable-production.up.railway.app`

Test it now:
```bash
# Test multiple registrations
curl -X POST https://findable-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"TestPass123!","email":"test1@test.com"}'
```

Run this 4 times quickly to see rate limiting in action!

