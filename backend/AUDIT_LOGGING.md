# Audit Logging System

## Overview

The Droplin backend now includes a comprehensive audit logging system that tracks all sensitive operations for security, compliance, and debugging purposes.

## Features

- **Comprehensive Event Tracking**: Logs all critical operations including authentication, profile updates, and privacy zone changes
- **IP Address Capture**: Records the client IP address for each action (handles proxy headers like X-Forwarded-For)
- **User Agent Tracking**: Captures browser/app information for each request
- **Structured Details**: Stores additional context as JSON for each event
- **Admin API**: Query and filter audit logs via REST API
- **Automatic Retention**: Built-in cleanup for logs older than 90 days

## Database Schema

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,              -- Unique log ID
    user_id INTEGER,                     -- User who performed the action (NULL for anonymous)
    action TEXT NOT NULL,                -- Action type (e.g., 'user_registration')
    details TEXT,                        -- JSON string with additional details
    ip_address TEXT,                     -- Client IP address
    user_agent TEXT,                     -- User agent string
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- When the action occurred
);
```

## Logged Events

### Authentication Events

| Action | Description | Details Included |
|--------|-------------|------------------|
| `user_registration` | Successful user registration | username, email |
| `registration_failed` | Failed registration attempt | username, reason (e.g., username_taken, invalid_password) |
| `login_success` | Successful login | username, remember_me |
| `login_failed` | Failed login attempt | username, reason (user_not_found, invalid_password, account_locked), failed_attempts |
| `account_locked` | Account locked due to failed attempts | username, failed_attempts, lock_duration_minutes |

### Profile Events

| Action | Description | Details Included |
|--------|-------------|------------------|
| `profile_update` | User profile updated | fields_updated (array of field names) |

### Privacy Zone Events

| Action | Description | Details Included |
|--------|-------------|------------------|
| `privacy_zone_created` | Privacy zone created | zone_id, address, radius |
| `privacy_zone_deleted` | Privacy zone deleted | zone_id |

### Error Events

| Action | Description | Details Included |
|--------|-------------|------------------|
| `registration_error` | Unexpected registration error | error message |

## API Usage

### View Audit Logs

**Endpoint:** `GET /admin/audit-logs`

**Headers:**
```
secret: delete-all-profiles-2024
```

**Query Parameters:**
- `user_id` (optional): Filter by user ID
- `action` (optional): Filter by action type
- `ip_address` (optional): Filter by IP address
- `limit` (optional): Maximum records to return (default: 100, max: 1000)
- `offset` (optional): Number of records to skip for pagination (default: 0)

**Example Request:**
```bash
# Get all logs
curl -H "secret: delete-all-profiles-2024" \
  https://findable-production.up.railway.app/admin/audit-logs

# Get login attempts for specific user
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?user_id=123&action=login_failed"

# Get all actions from specific IP
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?ip_address=192.168.1.100"

# Pagination
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?limit=50&offset=100"
```

**Response:**
```json
{
  "total_count": 1523,
  "limit": 100,
  "offset": 0,
  "logs": [
    {
      "id": 1523,
      "user_id": 42,
      "action": "login_success",
      "details": {
        "username": "johndoe",
        "remember_me": true
      },
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)",
      "timestamp": "2025-10-28T10:30:45.123456"
    },
    {
      "id": 1522,
      "user_id": null,
      "action": "registration_failed",
      "details": {
        "username": "testuser",
        "reason": "username_taken"
      },
      "ip_address": "203.0.113.42",
      "user_agent": "PostmanRuntime/7.26.8",
      "timestamp": "2025-10-28T10:25:12.654321"
    }
  ]
}
```

### Cleanup Old Logs

**Endpoint:** `POST /admin/cleanup-audit-logs`

**Headers:**
```
secret: delete-all-profiles-2024
```

**Query Parameters:**
- `days` (optional): Number of days to retain logs (default: 90)

**Example Request:**
```bash
# Delete logs older than 90 days (default)
curl -X POST \
  -H "secret: delete-all-profiles-2024" \
  https://findable-production.up.railway.app/admin/cleanup-audit-logs

# Delete logs older than 30 days
curl -X POST \
  -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/cleanup-audit-logs?days=30"
```

**Response:**
```json
{
  "success": true,
  "deleted_count": 1205,
  "retention_days": 90,
  "message": "Deleted 1205 audit log(s) older than 90 days"
}
```

## Security Features

### IP Address Detection

The system intelligently captures the real client IP address, even when behind proxies (like Railway):

1. **X-Forwarded-For** header (takes first IP in chain)
2. **X-Real-IP** header
3. Fallback to direct client host

This ensures accurate tracking even in production environments with load balancers or CDNs.

### Anonymous Actions

Some actions (like failed registrations) may not have a `user_id` since they occur before authentication. The `user_id` field is nullable to support these cases.

### Non-Blocking Logging

If audit logging fails (e.g., database error), the operation continues successfully. Audit failures are logged to console but don't disrupt user experience.

## Use Cases

### 1. Security Monitoring

Track suspicious activity:
```bash
# Find all failed login attempts from an IP
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?action=login_failed&ip_address=203.0.113.42"
```

### 2. Compliance Auditing

Review user profile changes:
```bash
# Get all profile updates for a specific user
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?user_id=123&action=profile_update"
```

### 3. Debugging

Investigate account lockouts:
```bash
# Find all account lockout events
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?action=account_locked"
```

### 4. User Activity Timeline

Track a user's complete activity:
```bash
# Get all actions by user ID
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?user_id=123&limit=1000"
```

## Maintenance

### Manual Cleanup

Run the cleanup endpoint periodically to remove old logs:

```bash
# Schedule this as a cron job or Railway service
curl -X POST \
  -H "secret: delete-all-profiles-2024" \
  https://findable-production.up.railway.app/admin/cleanup-audit-logs
```

### Recommended Schedule

- **Daily**: Check recent logs for suspicious activity
- **Weekly**: Review failed authentication attempts
- **Monthly**: Run cleanup to maintain 90-day retention

## PowerShell Examples

For Windows users:

```powershell
# View recent logs
Invoke-RestMethod `
  -Uri "https://findable-production.up.railway.app/admin/audit-logs?limit=20" `
  -Headers @{"secret"="delete-all-profiles-2024"} | ConvertTo-Json -Depth 5

# Filter by action
Invoke-RestMethod `
  -Uri "https://findable-production.up.railway.app/admin/audit-logs?action=login_success" `
  -Headers @{"secret"="delete-all-profiles-2024"} | ConvertTo-Json -Depth 5

# Cleanup old logs
Invoke-RestMethod `
  -Method POST `
  -Uri "https://findable-production.up.railway.app/admin/cleanup-audit-logs" `
  -Headers @{"secret"="delete-all-profiles-2024"}
```

## Integration with Existing Security Features

The audit logging system complements:

- **JWT Authentication**: Every protected endpoint logs who accessed it
- **Account Lockout**: Failed attempts and lockouts are tracked
- **Session Timeout**: Activity is logged with timestamps for timeout enforcement
- **API Key Rotation**: Key rotation events can be added to audit logs

## Future Enhancements

Potential improvements:

- **Real-time Alerts**: Webhook notifications for suspicious patterns
- **Log Aggregation**: Export logs to external services (Datadog, Splunk)
- **Advanced Queries**: Full-text search on details field
- **Automated Blocking**: Auto-block IPs with excessive failed attempts
- **Retention Policies**: Configurable retention per action type

## Testing

Test the audit logging system:

```bash
# 1. Register a new user (should log 'user_registration')
curl -X POST https://findable-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"audittest","password":"Test1234!","email":"audit@test.com"}'

# 2. View the logged event
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?action=user_registration&limit=1"

# 3. Try a failed login (should log 'login_failed')
curl -X POST https://findable-production.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"audittest","password":"WrongPassword123!"}'

# 4. View failed login attempts
curl -H "secret: delete-all-profiles-2024" \
  "https://findable-production.up.railway.app/admin/audit-logs?action=login_failed"
```

## Summary

The audit logging system provides:

✅ **Comprehensive tracking** of all sensitive operations  
✅ **IP address and user agent** capture for forensics  
✅ **Flexible querying** with filtering and pagination  
✅ **Automatic cleanup** with configurable retention  
✅ **Non-blocking operation** to maintain app performance  
✅ **Admin-only access** with secret key protection

All actions are logged automatically with no code changes needed for future endpoints that use the audit logging helpers.

