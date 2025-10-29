# IP Whitelisting for Rate Limiting

## Overview
During development and testing, you can whitelist your IP address to bypass rate limiting completely.

## How to Check Your IP Address

### Method 1: Use the Debug Endpoint
Open this URL in your browser:
```
https://findable-production.up.railway.app/debug/my-ip
```

**Response:**
```json
{
  "your_ip": "203.0.113.45",
  "is_whitelisted": false,
  "whitelist": ["127.0.0.1", "::1"],
  "message": "Add '203.0.113.45' to RATE_LIMIT_WHITELIST in main.py to bypass rate limiting"
}
```

### Method 2: Check Browser Console
When you get rate limited, the error response includes your IP in the logs.

## How to Whitelist Your IP

### Step 1: Find Your IP Address
Use the debug endpoint above to see your current IP.

### Step 2: Add to Whitelist
Edit `backend/main.py` around line 38:

```python
RATE_LIMIT_WHITELIST = [
    "127.0.0.1",        # localhost
    "::1",              # localhost IPv6
    "203.0.113.45",     # Your IP address - ADD HERE
]
```

### Step 3: Commit and Push
```bash
git add backend/main.py
git commit -m "Add IP to rate limit whitelist"
git push
```

### Step 4: Wait for Railway to Redeploy
Railway will automatically redeploy (takes ~1-2 minutes).

### Step 5: Verify
Open the debug endpoint again to confirm:
```json
{
  "your_ip": "203.0.113.45",
  "is_whitelisted": true,  ← Should be true now!
  ...
}
```

## Testing
Once whitelisted, you can:
- ✅ Register unlimited accounts per hour (instead of 3)
- ✅ Login unlimited times per minute (instead of 5)
- ✅ Refresh tokens unlimited times per minute (instead of 10)
- ✅ Test signup flows repeatedly without waiting

## Production Notes

### Security Considerations
- **Remove your IP from the whitelist before going to production**
- Only whitelist during development/testing
- Never commit sensitive IPs to public repositories
- Consider using environment variables for IP whitelists in production

### Environment Variable Alternative
For better security, you can use environment variables:

```python
# In main.py
import os

RATE_LIMIT_WHITELIST = [
    "127.0.0.1",
    "::1",
] + os.environ.get("RATE_LIMIT_WHITELIST_IPS", "").split(",")
```

Then in Railway:
```
RATE_LIMIT_WHITELIST_IPS=203.0.113.45,198.51.100.123
```

## Common Issues

### Issue: IP Changes Frequently
If your IP changes often (dynamic IP):
1. Use a VPN with a static IP
2. Test on a cloud server with static IP
3. Temporarily increase rate limits instead
4. Use localhost for testing

### Issue: Still Getting Rate Limited
1. Check your IP with `/debug/my-ip`
2. Verify IP is correctly added to whitelist
3. Wait for Railway deployment to complete
4. Clear your browser cache
5. Check for typos in IP address

### Issue: Localhost Not Working
If testing on `localhost:19006`:
- Your requests go through Railway, so you need your public IP whitelisted
- The localhost IPs (127.0.0.1, ::1) only work for direct server access
- Use the debug endpoint to see what IP Railway sees

## Rate Limit Details

### Current Limits (Non-Whitelisted)
- **Registration**: 3 requests per hour per IP
- **Login**: 5 requests per minute per IP
- **Token Refresh**: 10 requests per minute per IP

### Whitelisted Benefits
- **Unlimited requests** on all auth endpoints
- **No waiting periods** during testing
- **Rapid iteration** on signup/login flows
- **Easy debugging** without hitting limits

## Example Testing Workflow

### Without Whitelist (Frustrating)
```bash
# Attempt 1
curl .../auth/register  # Works
# Attempt 2
curl .../auth/register  # Works
# Attempt 3
curl .../auth/register  # Works
# Attempt 4
curl .../auth/register  # 429 Too Many Requests - Wait 1 hour!
```

### With Whitelist (Smooth)
```bash
# Attempt 1
curl .../auth/register  # Works
# Attempt 2
curl .../auth/register  # Works
# ... test 100 times ...
# Attempt 100
curl .../auth/register  # Still works!
```

## Cleanup

Before deploying to production:

```python
# REMOVE YOUR IP
RATE_LIMIT_WHITELIST = [
    "127.0.0.1",        # localhost
    "::1",              # localhost IPv6
    # "203.0.113.45",  # REMOVE THIS
]
```

Or better yet, keep it in environment variables and don't set them in production!

