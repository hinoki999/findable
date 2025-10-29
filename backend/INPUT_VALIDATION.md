# Input Validation & Sanitization Framework

## Overview
Comprehensive input validation and sanitization system using Pydantic models with custom validators to prevent SQL injection, XSS attacks, and ensure data integrity.

---

## Security Features

### 1. SQL Injection Prevention
**Patterns Detected:**
- OR/AND clauses with equals (`OR 1=1`)
- SQL keywords (UNION, SELECT, INSERT, UPDATE, DELETE, DROP, etc.)
- SQL comments (`--`, `/* */`)
- Statement separators (`;`)
- Exec/Execute commands

**Response:** `422 Unprocessable Entity` with error message

### 2. XSS Prevention
**Patterns Detected:**
- `<script>` tags
- `javascript:` protocol
- Event handlers (`onclick`, `onload`, etc.)
- `<iframe>`, `<object>`, `<embed>` tags

**Response:** `422 Unprocessable Entity` with error message

### 3. Input Sanitization
All string inputs are automatically:
- ✅ HTML tags stripped
- ✅ HTML entities decoded
- ✅ Whitespace trimmed
- ✅ Validated for length limits

---

## Validated Models

### RegisterRequest
```python
{
  "username": "john_doe",     # 3-20 chars, alphanumeric + underscore/period
  "password": "MyP@ssw0rd!",  # Min 8 chars, must include: uppercase, lowercase, number, special char
  "email": "user@example.com" # Optional, valid email format
}
```

**Validation Rules:**
- Username: 3-20 characters, `[a-z0-9_.]` only, converted to lowercase
- Password:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character from: `!@#$%^&*()_+-=[]{}; ':"\\|,.<>/?`
- Email: Valid email format (if provided)

**Error Examples:**
```json
{
  "detail": [
    {
      "loc": ["body", "username"],
      "msg": "Username must be 3-20 characters",
      "type": "value_error"
    }
  ]
}
```

### ProfileRequest
```python
{
  "name": "John Doe",               # Max 100 chars
  "email": "john@example.com",      # Valid email format
  "phone": "+1 (555) 123-4567",     # 10-15 digits, formatted
  "bio": "Software developer...",   # Max 500 chars
  "socialMedia": [...]              # Array of social media links
}
```

**Validation Rules:**
- Name: Max 100 characters, sanitized
- Email: Valid email format
- Phone:
  - 10-15 digits (excluding formatting)
  - Can contain: numbers, spaces, dashes, parentheses, `+`
  - Format examples: `555-1234`, `(555) 123-4567`, `+1-555-123-4567`
- Bio: Max 500 characters, sanitized
- All fields checked for SQL injection and XSS

### DeviceRequest (DeviceCreate)
```python
{
  "name": "iPhone 15",              # 1-100 chars
  "rssi": -65,                      # Signal strength
  "distance": 25.5,                 # 0-1000 feet
  "action": "dropped",              # Max 50 chars
  "phoneNumber": "(555) 123-4567",  # 10-20 chars, validated
  "email": "user@example.com",      # Max 100 chars, validated
  "bio": "About me...",             # Max 500 chars
  "socialMedia": [...]
}
```

**Validation Rules:**
- Name: 1-100 characters, sanitized
- RSSI: Integer (signal strength)
- Distance: 0-1000 feet
- Phone: 10-20 characters, phone format
- Email: Valid email format
- Bio: Max 500 characters, sanitized

### PrivacyZoneRequest
```python
{
  "address": "123 Main St, City, State",  # 1-200 chars
  "radius": 100,                          # 1-10000 meters
  "latitude": 37.7749,                    # -90 to 90
  "longitude": -122.4194                  # -180 to 180
}
```

**Validation Rules:**
- Address: 1-200 characters, sanitized
- Radius: 1-10,000 meters
- Latitude: -90 to 90 degrees
- Longitude: -180 to 180 degrees

### SettingsRequest
```python
{
  "darkMode": true,        # Boolean
  "maxDistance": 33        # 1-100 feet
}
```

**Validation Rules:**
- darkMode: Boolean (true/false)
- maxDistance: 1-100 feet

---

## Validation Functions

### Email Validation
```python
validate_email_format(email: str) -> str
```
- Validates: `user@domain.com` format
- Returns: Lowercase, trimmed email
- Raises: `ValueError` if invalid

### Phone Validation
```python
validate_phone_format(phone: str) -> str
```
- Validates: 10-15 digits
- Allows: Numbers, spaces, dashes, parentheses, `+`
- Examples: 
  - ✅ `(555) 123-4567`
  - ✅ `555-123-4567`
  - ✅ `+1-555-123-4567`
  - ❌ `abc-123-4567`
- Raises: `ValueError` if invalid

### Username Validation
```python
validate_username_format(username: str) -> str
```
- Length: 3-20 characters
- Characters: `[a-z0-9_.]`
- Returns: Lowercase username
- Raises: `ValueError` if invalid

### String Sanitization
```python
sanitize_string(value: str) -> str
```
- Strips HTML tags
- Decodes HTML entities
- Trims whitespace

### Security Checks
```python
check_sql_injection(value: str) -> None
check_xss(value: str) -> None
```
- Scans for malicious patterns
- Raises: `ValueError` if found

---

## Error Responses

### 422 Unprocessable Entity
Returned when validation fails:

```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "Descriptive error message",
      "type": "value_error"
    }
  ]
}
```

**Common Errors:**

**Password Validation:**
```json
{
  "detail": [
    {
      "loc": ["body", "password"],
      "msg": "Password must contain at least one uppercase letter",
      "type": "value_error"
    }
  ]
}
```

**Email Validation:**
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "Invalid email format",
      "type": "value_error"
    }
  ]
}
```

**SQL Injection Detected:**
```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "Input contains potentially malicious SQL patterns",
      "type": "value_error"
    }
  ]
}
```

**XSS Detected:**
```json
{
  "detail": [
    {
      "loc": ["body", "bio"],
      "msg": "Input contains potentially malicious script patterns",
      "type": "value_error"
    }
  ]
}
```

---

## Testing Validation

### Valid Requests

**Registration:**
```bash
curl -X POST https://findable-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "MyP@ssw0rd123!",
    "email": "john@example.com"
  }'
```

**Profile Update:**
```bash
curl -X POST https://findable-production.up.railway.app/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-123-4567",
    "bio": "Software developer"
  }'
```

### Invalid Requests (422 Errors)

**Weak Password:**
```bash
curl -X POST .../auth/register \
  -d '{
    "username": "john",
    "password": "weak",
    "email": "john@example.com"
  }'
# Returns: "Password must be at least 8 characters"
```

**Invalid Email:**
```bash
curl -X POST .../auth/register \
  -d '{
    "username": "john_doe",
    "password": "MyP@ssw0rd123!",
    "email": "not-an-email"
  }'
# Returns: "Invalid email format"
```

**SQL Injection Attempt:**
```bash
curl -X POST .../user/profile \
  -d '{
    "name": "'; DROP TABLE users; --"
  }'
# Returns: "Input contains potentially malicious SQL patterns"
```

**XSS Attempt:**
```bash
curl -X POST .../user/profile \
  -d '{
    "bio": "<script>alert('XSS')</script>"
  }'
# Returns: "Input contains potentially malicious script patterns"
```

---

## Implementation Details

### Pydantic v2 Features Used
- `constr()`: Constrained string types
- `conint()`: Constrained integer types
- `Field()`: Field metadata and descriptions
- `@validator`: Custom validation logic
- `pre=True`: Run validator before Pydantic validation

### Validation Order
1. **Pydantic type validation** (string, int, bool, etc.)
2. **Pydantic constraints** (min_length, max_length, ge, le)
3. **Custom validators** (sanitization, security checks, format validation)
4. **Model validation** (all fields validated)

### Performance
- ✅ Validation happens at request time (minimal overhead)
- ✅ Compiled regex patterns (cached)
- ✅ Early returns for None values
- ✅ No database queries during validation

---

## Security Best Practices

### ✅ What's Protected
- SQL Injection attacks
- XSS attacks
- HTML injection
- Excessive length inputs
- Invalid data formats
- Missing required fields

### ✅ What's Sanitized
- HTML tags removed
- HTML entities decoded
- Whitespace trimmed
- Case normalized (usernames, emails)

### ⚠️ Additional Recommendations
1. **Use parameterized queries** (already implemented with `execute_query`)
2. **Implement rate limiting** (already implemented)
3. **Use HTTPS** (already configured)
4. **Validate JWT tokens** (already implemented)
5. **Sanitize output** (consider for user-generated content display)

---

## Maintenance

### Adding New Validators
```python
@validator('field_name', pre=True)
def validate_field(cls, v):
    if v is None:
        return v
    # Custom validation logic
    if not is_valid(v):
        raise ValueError("Error message")
    return v
```

### Adding New Models
```python
class NewRequest(BaseModel):
    field: constr(max_length=100) = Field(..., description="Description")
    
    @validator('field', pre=True)
    def validate_field(cls, v):
        v = sanitize_string(v)
        check_sql_injection(v)
        check_xss(v)
        return v
```

### Updating Security Patterns
Edit `SQL_INJECTION_PATTERNS` or `XSS_PATTERNS` arrays to add new detection patterns.

---

## Credits
- Framework: FastAPI + Pydantic v2
- Security: Custom validators with regex pattern matching
- Deployed: Railway (PostgreSQL production)

