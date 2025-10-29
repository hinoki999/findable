# SQL Injection Protection - Droplin Backend

## Overview

This document describes the comprehensive SQL injection protection measures implemented in the Droplin backend API.

---

## Protection Layers

### Layer 1: Parameterized Queries (Primary Defense)

**All SQL queries use parameterized statements with placeholders, never string concatenation.**

#### Implementation

The `execute_query()` helper function ensures proper parameterization for both SQLite and PostgreSQL:

```python
def execute_query(cursor, query, params=None):
    """
    Execute a query with proper placeholder syntax.
    SQLite uses ? placeholders, PostgreSQL uses %s placeholders.
    """
    if USE_POSTGRES and params:
        query = query.replace('?', '%s')  # Convert placeholders
    
    if params:
        cursor.execute(query, params)  # ✅ SAFE: Parameters passed separately
    else:
        cursor.execute(query)
```

#### Examples

**✅ SAFE - Parameterized Query:**
```python
execute_query(cursor, 
    "SELECT * FROM users WHERE username = ?", 
    (username,)  # ✅ User input passed as parameter
)
```

**❌ DANGEROUS - String Interpolation (NOT USED IN THIS CODEBASE):**
```python
# This pattern is NEVER used in our code
cursor.execute(f"SELECT * FROM users WHERE username = '{username}'")  # ❌
cursor.execute("SELECT * FROM users WHERE username = " + username)     # ❌
```

---

### Layer 2: Input Validation (Pydantic Models)

**All user inputs are validated through Pydantic models before reaching the database.**

#### Implementation

```python
class RegisterRequest(BaseModel):
    username: constr(min_length=3, max_length=20)
    password: constr(min_length=8)
    email: Optional[constr(max_length=100)]
    
    @validator('username')
    def validate_username(cls, v):
        # Checks SQL injection patterns
        check_sql_injection(v)
        return v
```

#### SQL Injection Pattern Detection

```python
SQL_INJECTION_PATTERNS = [
    r"(\bOR\b|\bAND\b).*=.*",                    # OR 1=1, AND 1=1
    r"(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s",  # SQL keywords
    r"--",                                        # SQL comments
    r"/\*.*\*/",                                 # Multi-line comments
    r";\s*(DROP|DELETE|INSERT|UPDATE)",          # Statement injection
    r"(exec|execute)\s*\(",                      # Stored procedures
]

def check_sql_injection(value: str) -> None:
    """Reject input containing SQL injection patterns"""
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Input contains potentially malicious SQL patterns")
```

**Result:** Malicious inputs are rejected with `422 Unprocessable Entity` before reaching the database.

---

### Layer 3: String Sanitization

**All string inputs are sanitized to remove HTML tags and decode entities.**

```python
def sanitize_string(value: str) -> str:
    """Sanitize string input"""
    if not value:
        return value
    value = re.sub(r'<[^>]+>', '', value)  # Strip HTML tags
    value = html.unescape(value)            # Decode entities
    value = value.strip()                   # Trim whitespace
    return value
```

Applied to all text fields: names, bios, addresses, etc.

---

## Audit Report

### Automated Audit Results

```
[PASS] NO SQL INJECTION VULNERABILITIES FOUND!

[PASS] All 68 execute_query() calls use parameterized queries
[PASS] 6 cursor.execute() calls in init_db() (table creation - safe)
[PASS] 0 vulnerable cursor.execute() calls outside init_db()
```

**Tools:** Run `python audit_sql.py` to verify SQL injection protection.

---

## Protected Endpoints

All endpoints with user input are protected:

| Endpoint | Input Parameters | Protection Method |
|----------|------------------|-------------------|
| `/auth/register` | username, password, email | Parameterized + Pydantic validation |
| `/auth/login` | username, password | Parameterized + Pydantic validation |
| `/auth/send-verification-code` | username, email | Parameterized + Pydantic validation |
| `/auth/verify-code` | username, code | Parameterized queries |
| `/devices` (POST) | name, email, phone, bio | Parameterized + Pydantic validation + Sanitization |
| `/devices` (GET) | JWT user_id | Parameterized queries |
| `/devices/{device_id}` (DELETE) | device_id | Parameterized queries |
| `/user/profile` (POST) | name, email, phone, bio | Parameterized + Pydantic validation + Sanitization |
| `/user/settings` (POST) | dark_mode, max_distance | Parameterized + Pydantic validation |
| `/user/privacy-zones` (POST) | address, radius, lat, lng | Parameterized + Pydantic validation + Sanitization |
| `/user/pinned` (POST) | device_id | Parameterized queries |

---

## Testing SQL Injection Protection

### Run Automated Tests

```bash
cd backend
python test_sql_injection.py
```

**This script tests:**
- Login endpoint with SQL injection payloads
- Registration endpoint with malicious usernames
- SQL keyword detection and blocking
- Error handling (no 500 errors, only 401/422)

### Manual Testing Examples

**Test 1: Login SQL Injection Attempt**
```bash
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin'\'' OR '\''1'\''='\''1",
    "password": "anything"
  }'
```

**Expected:** `422 Unprocessable Entity` with error message about malicious SQL patterns.

**Test 2: Registration with SQL Keywords**
```bash
curl -X POST http://localhost:8081/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin'\'' UNION SELECT * FROM users--",
    "password": "Test123!",
    "email": "test@example.com"
  }'
```

**Expected:** `422 Unprocessable Entity` - SQL injection pattern detected.

---

## Database Differences (SQLite vs PostgreSQL)

### Placeholder Syntax

The `execute_query()` function handles placeholder conversion:
- **SQLite:** Uses `?` placeholders
- **PostgreSQL:** Uses `%s` placeholders

```python
# Written as SQLite-style
execute_query(cursor, "SELECT * FROM users WHERE id = ?", (user_id,))

# Automatically converted for PostgreSQL
# "SELECT * FROM users WHERE id = %s"
```

Both methods are **equally safe** - parameters are always passed separately from the query string.

---

## Common Attack Vectors (All Blocked)

| Attack Type | Example Payload | Protection Method |
|-------------|----------------|-------------------|
| Authentication Bypass | `admin' OR '1'='1` | Parameterized query + Pattern detection |
| UNION Injection | `' UNION SELECT * FROM users--` | Parameterized query + Pattern detection |
| Comment Injection | `admin'--` | Parameterized query + Pattern detection |
| Stacked Queries | `'; DROP TABLE users--` | Parameterized query + Pattern detection |
| Boolean Blind | `admin' AND 1=0--` | Parameterized query + Pattern detection |
| Time-Based Blind | `' OR SLEEP(5)--` | Parameterized query + Pattern detection |

---

## Security Best Practices Followed

✅ **Never concatenate user input into SQL queries**  
✅ **Always use parameterized queries (prepared statements)**  
✅ **Validate all inputs with Pydantic models**  
✅ **Sanitize string inputs (remove HTML, trim whitespace)**  
✅ **Detect and reject SQL injection patterns**  
✅ **Return clear error messages without exposing database details**  
✅ **Use JWT authentication to prevent unauthorized access**  
✅ **Apply ownership checks (users can only modify their own data)**  

---

## Maintenance

### Adding New Endpoints

When adding new endpoints that query the database:

1. **Use `execute_query()` helper:**
   ```python
   execute_query(cursor, "SELECT * FROM table WHERE column = ?", (value,))
   ```

2. **Define Pydantic model with validation:**
   ```python
   class MyRequest(BaseModel):
       field: constr(max_length=100)
       
       @validator('field')
       def validate_field(cls, v):
           check_sql_injection(v)
           return sanitize_string(v)
   ```

3. **Run audit:**
   ```bash
   python audit_sql.py
   ```

4. **Test with SQL injection payloads**

---

## Conclusion

**The Droplin backend is protected against SQL injection attacks through:**

1. **100% parameterized queries** (primary defense)
2. **Input validation** with SQL pattern detection (secondary defense)
3. **String sanitization** (tertiary defense)

**Status:** ✅ All 68 database queries audited and secured

**Last Audited:** 2025-10-27

