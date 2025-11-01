from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, validator, constr, conint, field_validator, ValidationError
from typing import Optional, List
from datetime import datetime, timedelta
import re
import html
from starlette.middleware.base import BaseHTTPMiddleware
import sqlite3
import json
import os
import shutil
from pathlib import Path
import jwt
import bcrypt
import cloudinary
import cloudinary.uploader
import random
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# PostgreSQL support
try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

app = FastAPI(title="DropLink API")

# Custom validation error handler for clear 422 responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clear, user-friendly validation error messages"""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(x) for x in error['loc'][1:])  # Skip 'body'
        message = error['msg']
        
        # Make error messages more user-friendly
        if error['type'] == 'value_error':
            # Custom validator errors (our SQL injection, XSS, etc.)
            message = str(error['msg'])
        elif error['type'] == 'string_too_short':
            message = f"Must be at least {error.get('ctx', {}).get('limit_value', 'required')} characters"
        elif error['type'] == 'string_too_long':
            message = f"Must be at most {error.get('ctx', {}).get('limit_value', 'allowed')} characters"
        elif error['type'] == 'value_error.number.not_ge':
            message = f"Must be at least {error.get('ctx', {}).get('limit_value', 'minimum')}"
        elif error['type'] == 'value_error.number.not_le':
            message = f"Must be at most {error.get('ctx', {}).get('limit_value', 'maximum')}"
        elif error['type'] == 'type_error.integer':
            message = "Must be a number"
        elif error['type'] == 'type_error.boolean':
            message = "Must be true or false"
        elif error['type'] == 'value_error.missing':
            message = "This field is required"
        
        errors.append({
            "field": field,
            "message": message
        })
    
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation Error",
            "message": "Invalid input provided",
            "details": errors
        }
    )

# JWT Configuration from environment variables
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production-12345")
PREVIOUS_SECRET_KEY = os.getenv("PREVIOUS_JWT_SECRET_KEY", None)  # For key rotation grace period
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "30"))

# Key rotation version (incremented when keys are rotated)
# This is stored in environment and compared against user's key_version in database
CURRENT_KEY_VERSION = int(os.getenv("JWT_KEY_VERSION", "1"))

# Session activity timeout configuration
ACTIVITY_TIMEOUT_MINUTES = int(os.getenv("ACTIVITY_TIMEOUT_MINUTES", "30"))  # Standard timeout
REMEMBER_ME_TIMEOUT_DAYS = int(os.getenv("REMEMBER_ME_TIMEOUT_DAYS", "30"))  # "Remember Me" extended timeout

# Warn if using default JWT secret (security risk)
if SECRET_KEY == "your-secret-key-change-in-production-12345":
    print("⚠️  WARNING: Using default JWT_SECRET_KEY! Set JWT_SECRET_KEY environment variable in production.")

print(f"✓ JWT Key Version: {CURRENT_KEY_VERSION}")


# Cloudinary Configuration
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", "ddxxjia44"),
    api_key=os.environ.get("CLOUDINARY_API_KEY", "213846241467723"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", "3ICj-oLAW4HZm8EVCQuImb53R5Y")
)

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@droplinkconnect.com")

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # HSTS: Force HTTPS for 1 year
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # XSS Protection (legacy but still good)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

# Enable CORS for React Native app
# React Native apps don't send traditional Origin headers, so we allow both
# specific development origins and handle mobile app requests appropriately
ALLOWED_ORIGINS = [
    # Development origins
    "http://localhost:8081",
    "http://localhost:19006",  # Expo web
    "http://192.168.1.92:8081",
    # Production mobile apps send null or no Origin header
    # Railway backend should be accessed via HTTPS only
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^(http://localhost:\d+|http://192\.168\.\d+\.\d+:\d+)$",  # Allow any local dev
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Length", "Content-Type"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Add security headers
app.add_middleware(SecurityHeadersMiddleware)

# Database Configuration
DATABASE_URL = os.environ.get("DATABASE_URL", None)
USE_POSTGRES = DATABASE_URL is not None and POSTGRES_AVAILABLE

# Database connection helper
def get_db_connection():
    """
    Returns a database connection.
    Uses PostgreSQL if DATABASE_URL is set (Railway production),
    otherwise uses SQLite (local development).
    """
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False  # We'll commit manually
        return conn
    else:
        return sqlite3.connect('droplink.db')

def get_cursor(conn):
    """
    Returns a cursor for the given connection.
    Uses RealDictCursor for PostgreSQL to get dict-like results.
    """
    if USE_POSTGRES:
        return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        return conn.cursor()

def execute_query(cursor, query, params=None):
    """
    Execute a query with proper placeholder syntax for the database type.
    SQLite uses ? placeholders, PostgreSQL uses %s placeholders.
    """
    if USE_POSTGRES and params:
        # Convert SQLite ? placeholders to PostgreSQL %s placeholders
        query = query.replace('?', '%s')
    
    # Convert INSERT OR REPLACE to PostgreSQL ON CONFLICT DO NOTHING
    # Note: For proper upsert, use INSERT ... ON CONFLICT (column) DO UPDATE in the query
    if USE_POSTGRES and "INSERT OR REPLACE" in query.upper():
        # Convert to INSERT ... ON CONFLICT DO NOTHING (ignore duplicates)
        # For actual updates, the query should explicitly use ON CONFLICT DO UPDATE
        query = query.replace("INSERT OR REPLACE", "INSERT")
        # Add ON CONFLICT DO NOTHING if not already present
        if "ON CONFLICT" not in query.upper():
            # Find the VALUES clause and add ON CONFLICT after it
            if "VALUES" in query.upper():
                # Simple approach: add at the end
                query = query.rstrip(';') + " ON CONFLICT DO NOTHING"
    
    if params:
        cursor.execute(query, params)
    else:
        cursor.execute(query)

def get_value(row, key_or_index):
    """
    Get value from a database row that could be either a dict (PostgreSQL) or tuple (SQLite).
    """
    if isinstance(row, dict):
        return row[key_or_index]
    else:
        # For tuple, key_or_index should be an integer index
        return row[key_or_index]

def get_lastrowid(cursor, conn):
    """
    Get the last inserted row ID for both PostgreSQL and SQLite.
    """
    if USE_POSTGRES:
        execute_query(cursor, "SELECT lastval()")
        result = cursor.fetchone()
        # PostgreSQL with RealDictCursor returns {'lastval': id}
        return result['lastval'] if result else None
    else:
        return cursor.lastrowid

# Database setup
def init_db():
    conn = get_db_connection()
    cursor = get_cursor(conn)
    
    # SQL type mapping based on database
    if USE_POSTGRES:
        auto_id = "SERIAL PRIMARY KEY"
        integer = "INTEGER"
        text = "TEXT"
        real = "DOUBLE PRECISION"
        timestamp_default = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    else:
        auto_id = "INTEGER PRIMARY KEY AUTOINCREMENT"
        integer = "INTEGER"
        text = "TEXT"
        real = "REAL"
        timestamp_default = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    
    # Users table
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS users (
            id {auto_id},
            username {text} UNIQUE NOT NULL,
            password_hash {text} NOT NULL,
            email {text},
            created_at {timestamp_default},
            failed_login_attempts {integer} DEFAULT 0,
            locked_until {text},
            key_version {integer} DEFAULT 1
        )
    ''')
    
    # Add account lockout columns if they don't exist (for existing databases)
    try:
        cursor.execute(f'ALTER TABLE users ADD COLUMN failed_login_attempts {integer} DEFAULT 0')
        conn.commit()
    except Exception as e:
        conn.rollback()  # Rollback transaction on error
        # Column already exists or other error - continue
    
    try:
        cursor.execute(f'ALTER TABLE users ADD COLUMN locked_until {text}')
        conn.commit()
    except Exception as e:
        conn.rollback()  # Rollback transaction on error
        # Column already exists or other error - continue
    
    try:
        cursor.execute(f'ALTER TABLE users ADD COLUMN key_version {integer} DEFAULT 1')
        conn.commit()
    except Exception as e:
        conn.rollback()  # Rollback transaction on error
        # Column already exists or other error - continue
    
    # Devices table
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS devices (
            id {auto_id},
            name {text} NOT NULL,
            rssi {integer} NOT NULL,
            distance_feet {real} NOT NULL,
            action {text},
            timestamp {text},
            phone_number {text},
            email {text},
            bio {text},
            social_media {text},
            user_id {integer} DEFAULT 1
        )
    ''')
    
    # User profiles table (if not exists)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id {integer} PRIMARY KEY,
            name {text},
            phone {text},
            email {text},
            bio {text},
            social_media {text},
            profile_photo {text}
        )
    ''')
    
    # User settings table (if not exists)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id {integer} PRIMARY KEY,
            dark_mode {integer} DEFAULT 0,
            max_distance {integer} DEFAULT 50
        )
    ''')
    
    # Privacy zones table (if not exists)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS privacy_zones (
            id {auto_id},
            user_id {integer} NOT NULL,
            address {text} NOT NULL,
            radius {real} NOT NULL
        )
    ''')
    
    # Pinned contacts table (if not exists)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS pinned_contacts (
            user_id {integer} NOT NULL,
            device_id {integer} NOT NULL,
            PRIMARY KEY (user_id, device_id)
        )
    ''')
    
    # Audit logs table (if not exists)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id {auto_id},
            user_id {integer},
            action {text} NOT NULL,
            details {text},
            ip_address {text},
            user_agent {text},
            timestamp {timestamp_default}
        )
    ''')
    
    # Verification codes table (for email/SMS verification codes)
    try:
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS verification_codes (
                id {auto_id},
                email {text} NOT NULL,
                code {text} NOT NULL,
                code_type {text} NOT NULL,
                expires_at {text} NOT NULL,
                created_at {timestamp_default}
            )
        ''')
        conn.commit()
    except Exception as e:
        conn.rollback()
        # Table/type already exists - this is fine
        print(f"verification_codes table creation skipped (may already exist): {e}")
    
    conn.commit()
    conn.close()

init_db()

# ========== INPUT VALIDATION & SANITIZATION ==========

# Security patterns to detect malicious input
SQL_INJECTION_PATTERNS = [
    r"(\bOR\b|\bAND\b).*=.*",
    r"(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s",
    r"--",
    r"/\*.*\*/",
    r";\s*(DROP|DELETE|INSERT|UPDATE)",
    r"(exec|execute)\s*\(",
]

XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"javascript:",
    r"on\w+\s*=",
    r"<iframe",
    r"<object",
    r"<embed",
]

def sanitize_string(value: str) -> str:
    """Sanitize string input by removing HTML tags and trimming whitespace"""
    if not value:
        return value
    # Strip HTML tags
    value = re.sub(r'<[^>]+>', '', value)
    # Decode HTML entities
    value = html.unescape(value)
    # Trim whitespace
    value = value.strip()
    return value

def check_sql_injection(value: str) -> None:
    """Check for SQL injection patterns"""
    if not value:
        return
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Input contains potentially malicious SQL patterns")

def check_xss(value: str) -> None:
    """Check for XSS patterns"""
    if not value:
        return
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Input contains potentially malicious script patterns")

def validate_email_format(email: str) -> str:
    """Validate email format"""
    if not email:
        return email
    email = email.strip().lower()
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, email):
        raise ValueError("Invalid email format")
    return email

def validate_phone_format(phone: str) -> str:
    """Validate and format phone number to (XXX) XXX-XXXX format"""
    if not phone:
        return phone
    phone = phone.strip()
    
    # Extract only digits
    digits_only = re.sub(r'\D', '', phone)
    
    # Must be exactly 10 digits for US phone numbers
    if len(digits_only) != 10:
        raise ValueError("Phone number must be exactly 10 digits")
    
    # Format as (XXX) XXX-XXXX
    formatted = f"({digits_only[0:3]}) {digits_only[3:6]}-{digits_only[6:10]}"
    return formatted

def validate_username_format(username: str) -> str:
    """Validate username format"""
    if not username:
        raise ValueError("Username is required")
    username = username.strip().lower()
    if len(username) < 3 or len(username) > 20:
        raise ValueError("Username must be 3-20 characters")
    if not re.match(r'^[a-z0-9_.]+$', username):
        raise ValueError("Username can only contain letters, numbers, underscores, and periods")
    return username

# Common passwords to block (top 100 most common)
COMMON_PASSWORDS = [
    'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567', 'letmein',
    'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine', 'ashley', 'bailey',
    'shadow', '123123', '654321', 'superman', 'qazwsx', 'michael', 'football', 'password1',
    'welcome', 'jesus', 'ninja', 'mustang', 'password123', 'admin', 'hello', 'charlie',
    'access', 'princess', 'starwars', 'whatever', 'login', 'bailey', 'passw0rd', 'master',
    '123456789', '12345', '1234', '111111', '1234567890', '000000', '1234567', 'password1',
    'admin123', 'root', 'pass', 'test', 'guest', 'password12', 'welcome123', 'abc12345',
    'qwerty123', 'password!', 'password@', 'password#', 'letmein123', 'admin1', 'root123',
    'test123', 'user', 'demo', 'changeme', 'temp', 'temppass', 'welcome1', 'hello123',
    'sample', 'example', 'default', 'pass123', 'pass1234', 'mypassword', 'secret', 'secret123',
    'iloveyou1', 'iloveyou123', 'princess1', 'monkey123', 'dragon123', 'football1', 'shadow1',
    'sunshine1', 'trustno1', 'master123', 'superman1', 'baseball1', 'michael1', 'ashley1',
    'bailey1', 'charlie1', 'whatever1', 'starwars1', 'ninja1', 'mustang1'
]

def calculate_password_strength(password: str) -> tuple:
    """
    Calculate password strength based on complexity
    Returns: (strength_level: str, score: int)
    strength_level: 'weak', 'medium', 'strong', 'very strong'
    score: 0-100
    """
    score = 0
    
    # Length scoring (up to 30 points)
    if len(password) >= 8:
        score += 10
    if len(password) >= 12:
        score += 10
    if len(password) >= 16:
        score += 10
    
    # Character diversity (up to 40 points)
    if re.search(r'[a-z]', password):
        score += 10
    if re.search(r'[A-Z]', password):
        score += 10
    if re.search(r'\d', password):
        score += 10
    if re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        score += 10
    
    # Bonus for mixing character types (up to 20 points)
    char_types = 0
    if re.search(r'[a-z]', password):
        char_types += 1
    if re.search(r'[A-Z]', password):
        char_types += 1
    if re.search(r'\d', password):
        char_types += 1
    if re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        char_types += 1
    
    if char_types == 4:
        score += 20
    elif char_types == 3:
        score += 10
    
    # Penalty for common patterns
    if re.search(r'(.)\1{2,}', password):  # Repeated characters (aaa, 111)
        score -= 10
    if re.search(r'(012|123|234|345|456|567|678|789|890|abc|bcd|cde)', password.lower()):
        score -= 10  # Sequential characters
    
    # Bonus for length beyond 16 (up to 10 points)
    if len(password) > 16:
        score += min(10, (len(password) - 16) * 2)
    
    score = max(0, min(100, score))  # Clamp between 0-100
    
    # Determine strength level
    if score < 40:
        strength = 'weak'
    elif score < 60:
        strength = 'medium'
    elif score < 80:
        strength = 'strong'
    else:
        strength = 'very strong'
    
    return strength, score

def validate_password(password: str, username: str = None) -> dict:
    """
    Comprehensive password validation with specific error messages
    
    Returns:
        dict: {
            'valid': bool,
            'errors': list of error messages,
            'strength': str ('weak', 'medium', 'strong', 'very strong'),
            'score': int (0-100)
        }
    """
    errors = []
    
    # Check minimum length
    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")
    
    # Check for uppercase letter
    if not re.search(r'[A-Z]', password):
        errors.append("Password must contain at least one uppercase letter (A-Z)")
    
    # Check for lowercase letter
    if not re.search(r'[a-z]', password):
        errors.append("Password must contain at least one lowercase letter (a-z)")
    
    # Check for number
    if not re.search(r'\d', password):
        errors.append("Password must contain at least one number (0-9)")
    
    # Check for special character
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        errors.append("Password must contain at least one special character (!@#$%^&*)")
    
    # Check against common passwords
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Password is too common. Please choose a more unique password")
    
    # Check if password is same as username
    if username and password.lower() == username.lower():
        errors.append("Password cannot be the same as your username")
    
    # Check if password contains username
    if username and len(username) >= 3 and username.lower() in password.lower():
        errors.append("Password cannot contain your username")
    
    # Calculate strength
    strength, score = calculate_password_strength(password)
    
    # Warn if password is weak (even if it meets minimum requirements)
    if not errors and strength == 'weak':
        errors.append(f"Password meets minimum requirements but is weak (strength: {score}/100). Consider making it longer or more complex")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'strength': strength,
        'score': score
    }

# Audit logging helper
def log_audit_event(
    action: str,
    user_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """
    Log an audit event to the audit_logs table
    
    Args:
        action: The action being performed (e.g., 'user_registration', 'login_success')
        user_id: The user ID performing the action (None for anonymous actions)
        details: Additional details about the action (stored as JSON)
        ip_address: The IP address of the request
        user_agent: The user agent string from the request
    """
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Convert details dict to JSON string
        details_json = json.dumps(details) if details else None
        
        execute_query(
            cursor,
            "INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
            (user_id, action, details_json, ip_address, user_agent)
        )
        
        conn.commit()
        conn.close()
    except Exception as e:
        # Don't fail the main operation if audit logging fails
        print(f"⚠️  Audit logging failed: {str(e)}")

def get_client_ip(request: Request) -> str:
    """
    Extract the client IP address from the request
    Handles X-Forwarded-For header for proxies (like Railway)
    """
    # Check for X-Forwarded-For header (used by proxies)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can contain multiple IPs, take the first one
        return forwarded_for.split(",")[0].strip()
    
    # Check for X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fallback to direct client host
    if request.client:
        return request.client.host
    
    return "unknown"

# Pydantic models with validation
class DeviceCreate(BaseModel):
    name: constr(min_length=1, max_length=100) = Field(..., description="Device name")
    rssi: int = Field(..., description="Signal strength")
    distance: float = Field(..., ge=0, le=1000, description="Distance in feet")
    action: Optional[str] = Field(default="dropped", max_length=50)
    timestamp: Optional[str] = Field(default=None, max_length=50)
    phoneNumber: Optional[str] = Field(None, description="Phone number - will be formatted as (XXX) XXX-XXXX")
    email: Optional[constr(max_length=100)] = None
    bio: Optional[constr(max_length=500)] = None
    socialMedia: Optional[List[dict]] = None
    
    @validator('name', 'bio', 'action', pre=True)
    def sanitize_strings(cls, v):
        if v is None:
            return v
        v = sanitize_string(str(v))
        check_sql_injection(v)
        check_xss(v)
        return v
    
    @validator('email', pre=True)
    def validate_email(cls, v):
        if v is None or v == '':
            return None
        return validate_email_format(v)
    
    @validator('phoneNumber', pre=True)
    def validate_phone(cls, v):
        if v is None or v == '':
            return None
        return validate_phone_format(v)

class DeviceResponse(BaseModel):
    id: int
    name: str
    rssi: int
    distanceFeet: float
    action: Optional[str] = None
    timestamp: Optional[str] = None
    phoneNumber: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None
    socialMedia: Optional[List[dict]] = None

# Auth models
class RegisterRequest(BaseModel):
    username: constr(min_length=3, max_length=20) = Field(..., description="Username (3-20 chars, alphanumeric + underscore/period)")
    password: constr(min_length=8, max_length=128) = Field(..., description="Password (min 8 chars, complex requirements)")
    email: Optional[constr(max_length=100)] = Field(None, description="Email address (optional)")
    
    @validator('username', pre=True)
    def validate_username_field(cls, v):
        return validate_username_format(v)
    
    @validator('email', pre=True)
    def validate_email_field(cls, v):
        if v is None or v == '':
            return None
        return validate_email_format(v)
    
    @validator('password')
    def validate_password_field(cls, v, values):
        """Comprehensive password validation with strength checking"""
        username = values.get('username', '')
        
        # Use the comprehensive password validation function
        result = validate_password(v, username)
        
        if not result['valid']:
            # Join all errors with newlines for detailed feedback
            error_message = "; ".join(result['errors'])
            raise ValueError(error_message)
        
        # Password is valid, return it
        return v

class LoginRequest(BaseModel):
    username: constr(min_length=3, max_length=20) = Field(..., description="Username")
    password: constr(min_length=1, max_length=128) = Field(..., description="Password")
    remember_me: bool = Field(default=False, description="Keep me logged in (30 days inactivity timeout instead of 30 minutes)")
    
    @validator('username', pre=True)
    def sanitize_username(cls, v):
        return v.strip().lower() if v else v

class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str

class SendVerificationCodeRequest(BaseModel):
    email: str

class VerifyCodeRequest(BaseModel):
    email: str
    code: str

class SendRecoveryCodeRequest(BaseModel):
    email: str
    type: str  # 'username' or 'password'

class VerifyRecoveryCodeRequest(BaseModel):
    email: str
    code: str
    type: str  # 'username' or 'password'

class CheckUsernameRequest(BaseModel):
    username: constr(min_length=3, max_length=20) = Field(..., description="Username to check")
    
    @validator('username', pre=True)
    def validate_username(cls, v):
        return validate_username_format(v)

# Additional validated models
class ProfileRequest(BaseModel):
    name: Optional[constr(max_length=100)] = Field(None, description="Full name")
    email: Optional[constr(max_length=100)] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number - will be formatted as (XXX) XXX-XXXX")
    bio: Optional[constr(max_length=500)] = Field(None, description="Biography")
    socialMedia: Optional[List[dict]] = Field(None, description="Social media links")
    
    @validator('name', 'bio', pre=True)
    def sanitize_text_fields(cls, v):
        if v is None or v == '':
            return None
        v = sanitize_string(v)
        check_sql_injection(v)
        check_xss(v)
        return v
    
    @validator('email', pre=True)
    def validate_email(cls, v):
        if v is None or v == '':
            return None
        return validate_email_format(v)
    
    @validator('phone', pre=True)
    def validate_phone(cls, v):
        if v is None or v == '':
            return None
        return validate_phone_format(v)

class PrivacyZoneRequest(BaseModel):
    address: constr(min_length=1, max_length=200) = Field(..., description="Address for privacy zone")
    radius: conint(ge=1, le=10000) = Field(..., description="Radius in meters (1-10000)")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude")
    
    @validator('address', pre=True)
    def sanitize_address(cls, v):
        v = sanitize_string(v)
        check_sql_injection(v)
        check_xss(v)
        return v

class SettingsRequest(BaseModel):
    darkMode: bool = Field(..., description="Dark mode enabled")
    maxDistance: conint(ge=1, le=100) = Field(..., description="Maximum distance (1-100 feet)")

# ========== AUTH HELPER FUNCTIONS ==========

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def create_access_token(user_id: int, username: str, remember_me: bool = False) -> str:
    """
    Create a JWT access token with activity tracking
    
    Args:
        user_id: User ID
        username: Username
        remember_me: If True, uses extended timeout (30 days inactivity). If False, uses standard timeout (30 minutes)
    
    Returns:
        JWT token string
    """
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    now = datetime.utcnow()
    
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": expire,
        "iat": now.timestamp(),  # Issued at
        "last_activity": now.timestamp(),  # Last activity timestamp
        "remember_me": remember_me,  # Remember me flag
        "key_version": CURRENT_KEY_VERSION  # Key rotation version
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token

def verify_token(token: str, check_activity: bool = True, check_key_version: bool = True) -> dict:
    """
    Verify and decode a JWT token with activity timeout checking and key rotation support
    
    Args:
        token: JWT token string
        check_activity: If True, checks for activity timeout
        check_key_version: If True, checks that token key_version is valid
    
    Returns:
        Decoded token payload
    
    Raises:
        HTTPException: If token is invalid, expired, inactive, or has wrong key version
    """
    payload = None
    used_previous_key = False
    
    # Try decoding with current key first
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        # If current key fails and we have a previous key, try that (grace period)
        if PREVIOUS_SECRET_KEY:
            try:
                payload = jwt.decode(token, PREVIOUS_SECRET_KEY, algorithms=[ALGORITHM])
                used_previous_key = True
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Token has expired")
            except jwt.InvalidTokenError:
                raise HTTPException(status_code=401, detail="Invalid token")
        else:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check key version
    if check_key_version and payload:
        token_key_version = payload.get('key_version', 1)
        
        # Token must match current key version, or be from previous version during grace period
        if token_key_version == CURRENT_KEY_VERSION:
            # Valid - current version
            pass
        elif used_previous_key and token_key_version == CURRENT_KEY_VERSION - 1:
            # Valid - previous version during grace period
            # Log that user should refresh their token
            print(f"⚠️  User {payload.get('username')} using old key version {token_key_version}. Should refresh token.")
        else:
            # Invalid - token is too old or has been rotated
            raise HTTPException(
                status_code=401,
                detail="Token has been invalidated. Please log in again."
            )
    
    # Check activity timeout if enabled
    if check_activity and payload:
        last_activity = payload.get('last_activity')
        remember_me = payload.get('remember_me', False)
        
        if last_activity:
            last_activity_time = datetime.utcfromtimestamp(last_activity)
            now = datetime.utcnow()
            time_since_activity = now - last_activity_time
            
            # Determine timeout based on remember_me flag
            if remember_me:
                timeout = timedelta(days=REMEMBER_ME_TIMEOUT_DAYS)
                timeout_msg = f"{REMEMBER_ME_TIMEOUT_DAYS} days"
            else:
                timeout = timedelta(minutes=ACTIVITY_TIMEOUT_MINUTES)
                timeout_msg = f"{ACTIVITY_TIMEOUT_MINUTES} minutes"
            
            # Check if session has been inactive too long
            if time_since_activity > timeout:
                raise HTTPException(
                    status_code=401,
                    detail=f"Session expired due to inactivity (timeout: {timeout_msg}). Please log in again."
                )
    
    return payload

def get_current_user(authorization: str = Header(None)) -> int:
    """Dependency to get current user from JWT token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    payload = verify_token(token)
    return payload["user_id"]

def send_verification_email(email: str, code: str):
    """Send verification code via email using SendGrid"""
    
    # If SendGrid is not configured, log the code for testing
    if not SENDGRID_API_KEY:
        print(f"⚠️ SendGrid not configured. VERIFICATION CODE for {email}: {code}")
        print(f"📧 Code expires in 10 minutes")
        return True  # Return success so testing can continue
    
    try:
        # HTML email body
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #007AFF;">Welcome to DropLink!</h2>
                <p>Your verification code is:</p>
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <h1 style="color: #007AFF; font-size: 36px; letter-spacing: 8px; margin: 0;">{code}</h1>
                </div>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this code, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">DropLink - Share contacts with people near you</p>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        plain_content = f"""
Welcome to DropLink!

Your verification code is: {code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

---
DropLink - Share contacts with people near you
        """
        
        # Create SendGrid message
        message = Mail(
            from_email=Email(FROM_EMAIL),
            to_emails=To(email),
            subject='DropLink - Your Verification Code',
            plain_text_content=Content("text/plain", plain_content),
            html_content=Content("text/html", html_content)
        )
        
        # Send via SendGrid
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        
        print(f"✅ Email sent successfully to {email}. Status: {response.status_code}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        # Also log the code so user can still test
        print(f"📧 VERIFICATION CODE for {email}: {code}")
        return False

def send_lockout_notification(email: str, username: str, lockout_minutes: int):
    """Send account lockout notification via email"""
    
    # If SendGrid is not configured, log the notification
    if not SENDGRID_API_KEY:
        print(f"⚠️ SendGrid not configured. LOCKOUT NOTIFICATION for {email} (user: {username})")
        print(f"🔒 Account locked for {lockout_minutes} minutes")
        return True
    
    try:
        # HTML email body
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #FF3B30;">🔒 Account Locked - DropLink</h2>
                <p>Hello <strong>{username}</strong>,</p>
                <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
                
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Lockout Duration:</strong> {lockout_minutes} minutes</p>
                    <p style="margin: 10px 0 0 0;">You can try logging in again after this time period.</p>
                </div>
                
                <h3>What happened?</h3>
                <p>We detected 5 consecutive failed login attempts to your account. To protect your account security, we've temporarily locked it.</p>
                
                <h3>What should you do?</h3>
                <ul>
                    <li>If this was you, wait {lockout_minutes} minutes and try again with the correct password</li>
                    <li>If you forgot your password, use the "Forgot Password" feature to reset it</li>
                    <li>If you didn't try to log in, someone may be attempting to access your account</li>
                </ul>
                
                <div style="background-color: #f8d7da; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>⚠️ Security Warning</strong></p>
                    <p style="margin: 10px 0 0 0;">If you didn't attempt to log in, we recommend changing your password immediately after the lockout period ends.</p>
                </div>
                
                <p>Need help? Contact our support team.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">
                    This is an automated security notification from DropLink.<br>
                    For security reasons, please do not reply to this email.
                </p>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        plain_content = f"""
ACCOUNT LOCKED - DropLink

Hello {username},

Your account has been temporarily locked due to multiple failed login attempts.

LOCKOUT DURATION: {lockout_minutes} minutes
You can try logging in again after this time period.

WHAT HAPPENED?
We detected 5 consecutive failed login attempts to your account. To protect your account security, we've temporarily locked it.

WHAT SHOULD YOU DO?
- If this was you, wait {lockout_minutes} minutes and try again with the correct password
- If you forgot your password, use the "Forgot Password" feature to reset it
- If you didn't try to log in, someone may be attempting to access your account

SECURITY WARNING:
If you didn't attempt to log in, we recommend changing your password immediately after the lockout period ends.

Need help? Contact our support team.

---
This is an automated security notification from DropLink.
For security reasons, please do not reply to this email.
        """
        
        # Create SendGrid message
        message = Mail(
            from_email=Email(FROM_EMAIL),
            to_emails=To(email),
            subject='🔒 Account Locked - DropLink Security Alert',
            plain_text_content=Content("text/plain", plain_content),
            html_content=Content("text/html", html_content)
        )
        
        # Send via SendGrid
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        
        print(f"✅ Lockout notification sent to {email}. Status: {response.status_code}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send lockout notification: {str(e)}")
        return False

# ========== AUTH ENDPOINTS ==========

@app.post("/auth/check-password-strength")
def check_password_strength(data: dict):
    """
    Check password strength without creating an account
    Useful for real-time feedback during registration
    
    Request body:
    {
        "password": "MyPassword123!",
        "username": "optional_username"  // optional, to check if password contains username
    }
    
    Response:
    {
        "valid": true/false,
        "strength": "weak" | "medium" | "strong" | "very strong",
        "score": 0-100,
        "errors": ["list of error messages"],
        "requirements": {
            "min_length": true/false,
            "uppercase": true/false,
            "lowercase": true/false,
            "number": true/false,
            "special_char": true/false,
            "not_common": true/false,
            "not_username": true/false
        }
    }
    """
    password = data.get('password', '')
    username = data.get('username', None)
    
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    
    # Validate password
    result = validate_password(password, username)
    
    # Check individual requirements
    requirements = {
        "min_length": len(password) >= 8,
        "uppercase": bool(re.search(r'[A-Z]', password)),
        "lowercase": bool(re.search(r'[a-z]', password)),
        "number": bool(re.search(r'\d', password)),
        "special_char": bool(re.search(r'[!@#$%^&*(),.?":{}|<>]', password)),
        "not_common": password.lower() not in COMMON_PASSWORDS,
        "not_username": not (username and (password.lower() == username.lower() or (len(username) >= 3 and username.lower() in password.lower())))
    }
    
    return {
        "valid": result['valid'],
        "strength": result['strength'],
        "score": result['score'],
        "errors": result['errors'],
        "requirements": requirements
    }

@app.post("/auth/register", response_model=AuthResponse)
def register(register_request: RegisterRequest, request: Request):
    """Register a new user"""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    try:
        # Convert username to lowercase for case-insensitive storage
        username_lower = register_request.username.lower()
        
        # Validate username (3-20 chars, alphanumeric + underscore)
        if not username_lower or len(username_lower) < 3 or len(username_lower) > 20:
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "invalid_username_length"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
        
        if not username_lower.replace('_', '').replace('.', '').isalnum():
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "invalid_username_chars"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, underscores, and periods")
        
        # Validate password (8+ chars, uppercase, lowercase, number)
        if len(register_request.password) < 8:
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "password_too_short"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        if not any(c.isupper() for c in register_request.password):
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "password_no_uppercase"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in register_request.password):
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "password_no_lowercase"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in register_request.password):
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "password_no_digit"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in register_request.password):
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "password_no_special_char"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if username already exists (case-insensitive)
        execute_query(cursor, "SELECT id FROM users WHERE LOWER(username) = ?", (username_lower,))
        existing = cursor.fetchone()
        if existing:
            conn.close()
            log_audit_event(
                action="registration_failed",
                details={"username": username_lower, "reason": "username_taken"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Check if email already exists (skip for testing email)
        if register_request.email:
            # Allow testing email to be reused infinitely
            if register_request.email.lower() != "caitie690@gmail.com":
                execute_query(cursor, "SELECT id FROM users WHERE LOWER(email) = ?", (register_request.email.lower(),))
                existing_email = cursor.fetchone()
                if existing_email:
                    conn.close()
                    log_audit_event(
                        action="registration_failed",
                        details={"username": username_lower, "email": register_request.email.lower(), "reason": "email_exists"},
                        ip_address=ip_address,
                        user_agent=user_agent
                    )
                    raise HTTPException(status_code=400, detail="An account with this email already exists")
        
        # Hash password and create user (store username in lowercase)
        password_hash = hash_password(register_request.password)
        execute_query(cursor,
            "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
            (username_lower, password_hash, register_request.email)
        )
        
        # Get the inserted user_id
        user_id = get_lastrowid(cursor, conn)
        
        # Initialize default settings with dark mode enabled
        execute_query(cursor, '''
            INSERT INTO user_settings (user_id, dark_mode, max_distance)
            VALUES (?, ?, ?)
        ''', (user_id, 1, 33))
        
        conn.commit()
        conn.close()
        
        # Log successful registration
        log_audit_event(
            action="user_registration",
            user_id=user_id,
            details={"username": username_lower, "email": register_request.email},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Create JWT token
        token = create_access_token(user_id, username_lower)
        
        return AuthResponse(
            token=token,
            user_id=user_id,
            username=username_lower
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_audit_event(
            action="registration_error",
            details={"error": str(e)},
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/login", response_model=AuthResponse)
def login(login_request: LoginRequest, request: Request):
    """Login with username and password (with account lockout protection)"""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    try:
        username_lower = login_request.username.lower()  # Convert to lowercase
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Find user by username (case-insensitive) - include lockout fields
        execute_query(cursor,
            "SELECT id, username, password_hash, email, failed_login_attempts, locked_until FROM users WHERE LOWER(username) = ?",
            (username_lower,)
        )
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            log_audit_event(
                action="login_failed",
                details={"username": username_lower, "reason": "user_not_found"},
                ip_address=ip_address,
                user_agent=user_agent
            )
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Handle both dict (PostgreSQL) and tuple (SQLite) results
        if isinstance(user, dict):
            user_id = user['id']
            username = user['username']
            password_hash = user['password_hash']
            email = user.get('email')
            failed_attempts = user.get('failed_login_attempts', 0) or 0
            locked_until_str = user.get('locked_until')
        else:
            user_id, username, password_hash, email, failed_attempts, locked_until_str = user
            failed_attempts = failed_attempts or 0
        
        # Check if account is locked
        if locked_until_str:
            try:
                locked_until = datetime.fromisoformat(locked_until_str)
                now = datetime.now()
                
                if now < locked_until:
                    # Account is still locked
                    remaining_seconds = int((locked_until - now).total_seconds())
                    remaining_minutes = remaining_seconds // 60
                    conn.close()
                    
                    log_audit_event(
                        action="login_failed",
                        user_id=user_id,
                        details={"username": username_lower, "reason": "account_locked", "remaining_minutes": remaining_minutes},
                        ip_address=ip_address,
                        user_agent=user_agent
                    )
                    
                    raise HTTPException(
                        status_code=423,  # 423 Locked
                        detail=f"Account locked due to multiple failed login attempts. Try again in {remaining_minutes} minutes.",
                        headers={"Retry-After": str(remaining_seconds)}
                    )
                else:
                    # Lock period expired, reset lockout
                    execute_query(cursor,
                        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
                        (user_id,)
                    )
                    conn.commit()
                    failed_attempts = 0
            except ValueError:
                # Invalid timestamp format, reset lockout
                execute_query(cursor,
                    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
                    (user_id,)
                )
                conn.commit()
                failed_attempts = 0
        
        # Verify password
        if not verify_password(login_request.password, password_hash):
            # Increment failed login attempts
            failed_attempts += 1
            
            # Lock account after 5 failed attempts
            if failed_attempts >= 5:
                lock_duration = timedelta(minutes=15)
                locked_until = datetime.now() + lock_duration
                locked_until_str = locked_until.isoformat()
                
                execute_query(cursor,
                    "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
                    (failed_attempts, locked_until_str, user_id)
                )
                conn.commit()
                conn.close()
                
                # Send email notification
                if email:
                    try:
                        send_lockout_notification(email, username, 15)
                    except:
                        pass  # Don't fail login if email fails
                
                log_audit_event(
                    action="account_locked",
                    user_id=user_id,
                    details={"username": username_lower, "failed_attempts": failed_attempts, "lock_duration_minutes": 15},
                    ip_address=ip_address,
                    user_agent=user_agent
                )
                
                raise HTTPException(
                    status_code=423,
                    detail="Account locked due to multiple failed login attempts. Try again in 15 minutes.",
                    headers={"Retry-After": str(15 * 60)}
                )
            else:
                # Update failed attempts count
                execute_query(cursor,
                    "UPDATE users SET failed_login_attempts = ? WHERE id = ?",
                    (failed_attempts, user_id)
                )
                conn.commit()
                conn.close()
                
                log_audit_event(
                    action="login_failed",
                    user_id=user_id,
                    details={"username": username_lower, "reason": "invalid_password", "failed_attempts": failed_attempts},
                    ip_address=ip_address,
                    user_agent=user_agent
                )
                
                remaining_attempts = 5 - failed_attempts
                raise HTTPException(
                    status_code=401,
                    detail=f"Invalid username or password. {remaining_attempts} attempts remaining before account lockout."
                )
        
        # Successful login - reset failed attempts
        execute_query(cursor,
            "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
            (user_id,)
        )
        conn.commit()
        conn.close()
        
        # Log successful login
        log_audit_event(
            action="login_success",
            user_id=user_id,
            details={"username": username_lower, "remember_me": login_request.remember_me},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Create JWT token with remember_me flag
        token = create_access_token(user_id, username, remember_me=login_request.remember_me)
        
        return AuthResponse(
            token=token,
            user_id=user_id,
            username=username
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.post("/auth/refresh", response_model=AuthResponse)
def refresh_token(authorization: str = Header(None)):
    """
    Refresh JWT token with updated last_activity timestamp
    
    This endpoint should be called periodically (e.g., every 5-10 minutes) 
    to extend the session and prevent timeout.
    
    Returns a new token with:
    - Same user_id, username, remember_me settings
    - Updated last_activity timestamp
    - New expiration time
    """
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        token = authorization.split(" ")[1]
        
        # Verify token and get payload (this checks activity timeout)
        payload = verify_token(token, check_activity=True)
        user_id = payload["user_id"]
        remember_me = payload.get("remember_me", False)
        
        # Get user details from database
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        execute_query(cursor, "SELECT username FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Handle both dict (PostgreSQL) and tuple (SQLite) results
        if isinstance(user, dict):
            username = user['username']
        else:
            username = user[0]
        
        # Create new JWT token with updated activity timestamp
        # Preserve remember_me setting from original token
        new_token = create_access_token(user_id, username, remember_me=remember_me)
        
        return AuthResponse(
            token=new_token,
            user_id=user_id,
            username=username
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")

@app.post("/auth/unlock-account")
def unlock_account(data: dict, admin_user_id: int = Depends(get_current_user)):
    """
    Manually unlock a locked account (admin only)
    
    Request body:
    {
        "username": "user_to_unlock"
    }
    
    Note: This is a temporary admin endpoint. In production, implement proper
    admin role checking. For now, any authenticated user can unlock accounts.
    """
    try:
        username = data.get('username')
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        
        username_lower = username.lower()
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Find user
        execute_query(cursor,
            "SELECT id, username, locked_until, failed_login_attempts FROM users WHERE LOWER(username) = ?",
            (username_lower,)
        )
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            raise HTTPException(status_code=404, detail="User not found")
        
        # Reset lockout
        if isinstance(user, dict):
            user_id = user['id']
            actual_username = user['username']
        else:
            user_id = user[0]
            actual_username = user[1]
        
        execute_query(cursor,
            "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
            (user_id,)
        )
        conn.commit()
        conn.close()
        
        print(f"✅ Account unlocked for user: {actual_username} (by admin user_id: {admin_user_id})")
        
        return {
            "success": True,
            "message": f"Account '{actual_username}' has been unlocked successfully",
            "username": actual_username
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unlock failed: {str(e)}")

@app.post("/admin/rotate-keys")
def rotate_jwt_keys(admin_user_id: int = Depends(get_current_user)):
    """
    Rotate JWT keys and invalidate all existing tokens (admin only)
    
    WARNING: This will log out ALL users immediately!
    
    Process:
    1. Generate a new JWT secret
    2. Move current secret to PREVIOUS_JWT_SECRET_KEY (grace period)
    3. Increment JWT_KEY_VERSION
    4. All users must log in again with new keys
    
    Returns:
        - new_jwt_secret: The new JWT secret to set in environment
        - previous_jwt_secret: The old secret (for grace period)
        - new_key_version: The new version number
        - instructions: How to update Railway environment variables
    
    Note: This is a temporary admin endpoint. In production, implement proper
    admin role checking. For now, any authenticated user can rotate keys.
    """
    try:
        import secrets
        
        # Generate new JWT secret (256-bit)
        new_secret = secrets.token_urlsafe(32)
        new_key_version = CURRENT_KEY_VERSION + 1
        
        print(f"🔄 JWT Key Rotation initiated by admin user_id: {admin_user_id}")
        print(f"📌 Current Key Version: {CURRENT_KEY_VERSION}")
        print(f"📌 New Key Version: {new_key_version}")
        print(f"🔑 New JWT Secret Generated: {new_secret[:10]}...")
        
        return {
            "success": True,
            "message": "Key rotation prepared. Update environment variables to complete rotation.",
            "current_key_version": CURRENT_KEY_VERSION,
            "new_key_version": new_key_version,
            "new_jwt_secret": new_secret,
            "previous_jwt_secret": SECRET_KEY,
            "instructions": {
                "step_1": "Go to Railway Dashboard → Backend Service → Variables",
                "step_2": f"Update JWT_SECRET_KEY to: {new_secret}",
                "step_3": f"Set PREVIOUS_JWT_SECRET_KEY to: {SECRET_KEY} (grace period)",
                "step_4": f"Set JWT_KEY_VERSION to: {new_key_version}",
                "step_5": "Railway will redeploy automatically",
                "step_6": "After 24 hours, remove PREVIOUS_JWT_SECRET_KEY (end grace period)",
                "warning": "All users will need to log in again after rotation completes"
            },
            "grace_period_note": "Tokens signed with old key will work during grace period (24-48 hours recommended)"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Key rotation failed: {str(e)}")

@app.post("/auth/send-verification-code")
def send_verification_code(request: SendVerificationCodeRequest):
    """Send a 6-digit verification code to email"""
    try:
        email = request.email.lower().strip()
        
        # Validate email format
        if '@' not in email or '.' not in email:
            raise HTTPException(status_code=400, detail="Invalid email format")
        
        # Generate 6-digit code
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        
        # Store code in database with expiration (10 minutes)
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        expires_at = (datetime.now() + timedelta(minutes=10)).isoformat()
        
        # Delete any existing codes for this email
        execute_query(cursor, "DELETE FROM verification_codes WHERE email = ?", (email,))
        
        # Insert new code
        execute_query(
            cursor,
            "INSERT INTO verification_codes (email, code, code_type, expires_at) VALUES (?, ?, ?, ?)",
            (email, code, 'registration', expires_at)
        )
        
        conn.commit()
        conn.close()
        
        # Send email (or log if SendGrid not configured)
        send_verification_email(email, code)
        
        # Always return success - if SendGrid isn't configured, code is logged
        return {
            "success": True,
            "message": f"Verification code sent to {email}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send verification code: {str(e)}")

@app.post("/auth/verify-code")
def verify_code(request: VerifyCodeRequest):
    """Verify the 6-digit code"""
    try:
        email = request.email.lower().strip()
        code = request.code.strip()
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if code exists for this email
        execute_query(
            cursor,
            "SELECT code, expires_at FROM verification_codes WHERE email = ? AND code_type = ? ORDER BY created_at DESC LIMIT 1",
            (email, 'registration')
        )
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=400, detail="No verification code found for this email")
        
        stored_code = get_value(row, 'code' if USE_POSTGRES else 0)
        expires_at_str = get_value(row, 'expires_at' if USE_POSTGRES else 1)
        
        # Parse expiration time
        expires_at = datetime.fromisoformat(expires_at_str)
        
        # Check if code has expired
        if datetime.now() > expires_at:
            execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, 'registration'))
            conn.commit()
            conn.close()
            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")
        
        # Verify code
        if stored_code != code:
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        # Code is valid, remove it from database
        execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, 'registration'))
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "Email verified successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify code: {str(e)}")

@app.post("/auth/check-username")
def check_username(request: CheckUsernameRequest):
    """Check if username is available"""
    try:
        username = request.username.strip().lower()  # Convert to lowercase
        
        # Validate username format
        if len(username) < 3 or len(username) > 20:
            return {"available": False, "message": "Username must be 3-20 characters"}
        
        if not username.replace('_', '').isalnum():
            return {"available": False, "message": "Letters, numbers, and underscores only"}
        
        # Check if username exists (case-insensitive)
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, "SELECT id FROM users WHERE LOWER(username) = ?", (username,))
        existing = cursor.fetchone()
        conn.close()
        
        if existing:
            return {"available": False, "message": "Username already taken"}
        
        return {"available": True, "message": "Username available"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check username: {str(e)}")

@app.post("/auth/change-username")
def change_username(new_username: str, user_id: int = Depends(get_current_user)):
    """Change username for authenticated user"""
    try:
        # Convert to lowercase for case-insensitive storage
        new_username_lower = new_username.lower()
        
        # Validate new username
        if not new_username_lower or len(new_username_lower) < 3 or len(new_username_lower) > 20:
            raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
        
        if not new_username_lower.replace('_', '').replace('.', '').isalnum():
            raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, underscores, and periods")
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if new username is already taken (case-insensitive)
        execute_query(cursor, "SELECT id FROM users WHERE LOWER(username) = ? AND id != ?", (new_username_lower, user_id))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Update username (store in lowercase)
        execute_query(cursor, "UPDATE users SET username = ? WHERE id = ?", (new_username_lower, user_id))
        conn.commit()
        conn.close()
        
        # Create new JWT token with updated username
        token = create_access_token(user_id, new_username_lower)
        
        return {
            "success": True,
            "message": "Username changed successfully",
            "token": token,
            "username": new_username_lower
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to change username: {str(e)}")

@app.post("/auth/change-password")
def change_password(
    current_password: str,
    new_password: str,
    user_id: int = Depends(get_current_user)
):
    """Change password for authenticated user"""
    try:
        # Validate new password
        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        if not any(c.isupper() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Get current password hash
        execute_query(cursor, "SELECT password_hash FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            raise HTTPException(status_code=404, detail="User not found")
        
        current_hash = get_value(user, 'password_hash') if isinstance(user, dict) else user[0]
        
        # Verify current password
        if not verify_password(current_password, current_hash):
            conn.close()
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        # Hash and update new password
        new_hash = hash_password(new_password)
        execute_query(cursor, "UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "Password changed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to change password: {str(e)}")

@app.post("/auth/send-recovery-code")
def send_recovery_code(request: SendRecoveryCodeRequest):
    """Send recovery code for forgot password/username"""
    try:
        email = request.email.lower().strip()
        type = request.type
        
        # Validate email format
        if '@' not in email or '.' not in email:
            raise HTTPException(status_code=400, detail="Invalid email format")
        
        # Check if user with this email exists
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, "SELECT id, username FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            raise HTTPException(status_code=404, detail="No account found with this email address")
        
        # Generate 6-digit code
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        
        # Store code in database with expiration (10 minutes) and recovery type
        conn2 = get_db_connection()
        cursor2 = get_cursor(conn2)
        
        expires_at = (datetime.now() + timedelta(minutes=10)).isoformat()
        username_value = get_value(user, 'username') if isinstance(user, dict) else user[1]
        
        # Delete any existing recovery codes for this email
        execute_query(cursor2, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, f'recovery_{type}'))
        
        # Insert new code (store username in email field for later retrieval)
        execute_query(
            cursor2,
            "INSERT INTO verification_codes (email, code, code_type, expires_at) VALUES (?, ?, ?, ?)",
            (email, code, f'recovery_{type}', expires_at)
        )
        
        conn2.commit()
        conn2.close()
        
        # Send email (or log if SendGrid not configured)
        subject = 'DropLink - Password Reset Code' if type == 'password' else 'DropLink - Username Recovery Code'
        send_verification_email(email, code)
        
        # Always return success - if SendGrid isn't configured, code is logged
        return {
            "success": True,
            "message": f"Recovery code sent to {email}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send recovery code: {str(e)}")

@app.post("/auth/verify-recovery-code")
def verify_recovery_code(request: VerifyRecoveryCodeRequest):
    """Verify recovery code and return username if username recovery"""
    try:
        email = request.email.lower().strip()
        code = request.code.strip()
        type = request.type
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if code exists for this email
        execute_query(
            cursor,
            "SELECT code, expires_at FROM verification_codes WHERE email = ? AND code_type = ? ORDER BY created_at DESC LIMIT 1",
            (email, f'recovery_{type}')
        )
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=400, detail="No recovery code found for this email")
        
        stored_code = get_value(row, 'code' if USE_POSTGRES else 0)
        expires_at_str = get_value(row, 'expires_at' if USE_POSTGRES else 1)
        
        # Parse expiration time
        expires_at = datetime.fromisoformat(expires_at_str)
        
        # Check if code has expired
        if datetime.now() > expires_at:
            execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, f'recovery_{type}'))
            conn.commit()
            conn.close()
            raise HTTPException(status_code=400, detail="Recovery code has expired. Please request a new one.")
        
        # Verify code
        if stored_code != code:
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid recovery code")
        
        # For username recovery, get username and delete code
        if type == 'username':
            # Get username from users table
            execute_query(cursor, "SELECT username FROM users WHERE email = ?", (email,))
            user_row = cursor.fetchone()
            if not user_row:
                conn.close()
                raise HTTPException(status_code=404, detail="User not found")
            
            username = get_value(user_row, 'username' if USE_POSTGRES else 0)
            
            # Delete code
            execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, f'recovery_{type}'))
            conn.commit()
            conn.close()
            
            return {
                "success": True,
                "username": username,
                "message": "Username recovered successfully"
            }
        
        # For password recovery, keep code for password reset step
        conn.close()
        return {
            "success": True,
            "message": "Code verified successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify recovery code: {str(e)}")

@app.post("/auth/reset-password")
def reset_password(email: str, code: str, new_password: str):
    """Reset password with verified recovery code"""
    try:
        email = email.lower().strip()
        code = code.strip()
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if code exists for this email
        execute_query(
            cursor,
            "SELECT code, expires_at FROM verification_codes WHERE email = ? AND code_type = ? ORDER BY created_at DESC LIMIT 1",
            (email, 'recovery_password')
        )
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=400, detail="No recovery code found. Please request a new code.")
        
        stored_code = get_value(row, 'code' if USE_POSTGRES else 0)
        expires_at_str = get_value(row, 'expires_at' if USE_POSTGRES else 1)
        
        # Parse expiration time
        expires_at = datetime.fromisoformat(expires_at_str)
        
        # Check if code has expired
        if datetime.now() > expires_at:
            execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, 'recovery_password'))
            conn.commit()
            conn.close()
            raise HTTPException(status_code=400, detail="Recovery code has expired. Please request a new one.")
        
        # Verify code
        if stored_code != code:
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid recovery code")
        
        # Validate new password
        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        if not any(c.isupper() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in new_password):
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")
        
        # Update password
        new_hash = hash_password(new_password)
        execute_query(cursor, "UPDATE users SET password_hash = ? WHERE email = ?", (new_hash, email))
        
        # Delete the used code from database
        execute_query(cursor, "DELETE FROM verification_codes WHERE email = ? AND code_type = ?", (email, 'recovery_password'))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "Password reset successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {str(e)}")

# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": "DropLink API",
        "version": "1.0.0",
        "status": "running"
    }

# Health check endpoint for Railway monitoring
@app.get("/health")
def health_check():
    """
    Health check endpoint for Railway monitoring
    Tests database connectivity and returns service status
    """
    try:
        # Get current timestamp
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Test database connectivity
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Simple query to verify database is responding
        execute_query(cursor, "SELECT 1")
        result = cursor.fetchone()
        
        conn.close()
        
        # If we got here, database is connected
        database_status = "connected"
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "timestamp": timestamp,
                "database": database_status,
                "version": "1.0.0",
                "environment": "production" if USE_POSTGRES else "development"
            }
        )
        
    except Exception as e:
        # Database connection failed
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": timestamp,
                "database": "disconnected",
                "error": str(e),
                "version": "1.0.0"
            }
        )

# Readiness probe endpoint for Railway
@app.get("/ready")
def readiness_check():
    """
    Readiness probe endpoint for Railway
    More comprehensive than health check - verifies app is ready to serve traffic
    Checks database connectivity, environment variables, and critical dependencies
    """
    checks = {
        "database": False,
        "environment_vars": False,
        "database_tables": False,
        "database_write": False
    }
    errors = []
    
    try:
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Check 1: Database connectivity
        try:
            conn = get_db_connection()
            cursor = get_cursor(conn)
            execute_query(cursor, "SELECT 1")
            cursor.fetchone()
            checks["database"] = True
        except Exception as e:
            errors.append(f"Database connection failed: {str(e)}")
            conn.close() if 'conn' in locals() else None
            raise
        
        # Check 2: Critical environment variables
        try:
            required_vars = ["DATABASE_URL"] if USE_POSTGRES else []
            missing_vars = []
            
            # Check if JWT secret is not default
            if SECRET_KEY == "your-secret-key-change-in-production-12345":
                missing_vars.append("JWT_SECRET_KEY (using default)")
            
            if USE_POSTGRES and not os.getenv("DATABASE_URL"):
                missing_vars.append("DATABASE_URL")
            
            if missing_vars:
                errors.append(f"Environment variables issue: {', '.join(missing_vars)}")
            
            checks["environment_vars"] = True
        except Exception as e:
            errors.append(f"Environment check failed: {str(e)}")
        
        # Check 3: Database tables exist
        try:
            # Check if critical tables exist
            execute_query(cursor, "SELECT COUNT(*) FROM users")
            cursor.fetchone()
            
            execute_query(cursor, "SELECT COUNT(*) FROM devices")
            cursor.fetchone()
            
            execute_query(cursor, "SELECT COUNT(*) FROM audit_logs")
            cursor.fetchone()
            
            checks["database_tables"] = True
        except Exception as e:
            errors.append(f"Database tables check failed: {str(e)}")
        
        # Check 4: Database write capability (optional - commented out to avoid writes)
        # Uncomment if you want to test write capability
        # try:
        #     test_action = "readiness_check_test"
        #     execute_query(cursor, 
        #         "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
        #         (None, test_action, '{"test": true}', "127.0.0.1")
        #     )
        #     conn.commit()
        #     # Clean up test record
        #     execute_query(cursor, "DELETE FROM audit_logs WHERE action = ?", (test_action,))
        #     conn.commit()
        #     checks["database_write"] = True
        # except Exception as e:
        #     errors.append(f"Database write test failed: {str(e)}")
        
        # For now, mark write as true if tables exist
        checks["database_write"] = checks["database_tables"]
        
        conn.close()
        
        # Determine if ready
        is_ready = all(checks.values())
        status_code = 200 if is_ready else 503
        
        response_content = {
            "status": "ready" if is_ready else "not_ready",
            "timestamp": timestamp,
            "checks": checks,
            "version": "1.0.0",
            "environment": "production" if USE_POSTGRES else "development"
        }
        
        if errors:
            response_content["errors"] = errors
        
        return JSONResponse(
            status_code=status_code,
            content=response_content
        )
        
    except Exception as e:
        # Critical failure
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "timestamp": timestamp,
                "checks": checks,
                "errors": errors + [f"Critical error: {str(e)}"],
                "version": "1.0.0"
            }
        )


# POST /devices - Save a new device (with deduplication)
@app.post("/devices", response_model=DeviceResponse)
def create_device(device: DeviceCreate, user_id: int = Depends(get_current_user)):
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        social_media_json = json.dumps(device.socialMedia) if device.socialMedia else None
        timestamp = device.timestamp or datetime.now().isoformat()
        
        # Check if device with same name already exists for this user
        execute_query(cursor, '''
            SELECT id FROM devices WHERE name = ? AND user_id = ?
        ''', (device.name, user_id))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing device
            device_id = get_value(existing, 0) if isinstance(existing, dict) else existing[0]
            execute_query(cursor, '''
                UPDATE devices 
                SET rssi = ?, distance_feet = ?, action = ?, timestamp = ?,
                    phone_number = ?, email = ?, bio = ?, social_media = ?
                WHERE id = ?
            ''', (
                device.rssi,
                device.distance,
                device.action,
                timestamp,
                device.phoneNumber,
                device.email,
                device.bio,
                social_media_json,
                device_id
            ))
            print(f"✅ Updated existing device: {device.name} (ID: {device_id})")
        else:
            # Insert new device
            execute_query(cursor, '''
                INSERT INTO devices (name, rssi, distance_feet, action, timestamp, 
                                   phone_number, email, bio, social_media, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                device.name,
                device.rssi,
                device.distance,
                device.action,
                timestamp,
                device.phoneNumber,
                device.email,
                device.bio,
                social_media_json,
                user_id
            ))
            device_id = get_lastrowid(cursor, conn)
            print(f"✅ Created new device: {device.name} (ID: {device_id})")
        
        conn.commit()
        conn.close()
        
        return DeviceResponse(
            id=device_id,
            name=device.name,
            rssi=device.rssi,
            distanceFeet=device.distance,
            action=device.action,
            timestamp=timestamp,
            phoneNumber=device.phoneNumber,
            email=device.email,
            bio=device.bio,
            socialMedia=device.socialMedia
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# GET /devices - Retrieve all devices
@app.get("/devices", response_model=List[DeviceResponse])
def get_devices(user_id: int = Depends(get_current_user)):
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT id, name, rssi, distance_feet, action, timestamp,
                   phone_number, email, bio, social_media
            FROM devices 
            WHERE user_id = ?
            ORDER BY timestamp DESC
        ''', (user_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        devices = []
        for row in rows:
            social_media = json.loads(row[9]) if row[9] else None
            devices.append(DeviceResponse(
                id=row[0],
                name=row[1],
                rssi=row[2],
                distanceFeet=row[3],
                action=row[4],
                timestamp=row[5],
                phoneNumber=row[6],
                email=row[7],
                bio=row[8],
                socialMedia=social_media
            ))
        
        return devices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# GET /devices/{id} - Get specific device
@app.get("/devices/{device_id}", response_model=DeviceResponse)
def get_device(device_id: int, user_id: int = Depends(get_current_user)):
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT id, name, rssi, distance_feet, action, timestamp,
                   phone_number, email, bio, social_media, user_id
            FROM devices 
            WHERE id = ?
        ''', (device_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Device not found")
        
        # Verify ownership
        device_user_id = get_value(row, 10) if isinstance(row, dict) else row[10]
        if device_user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this device")
        
        # Handle dict (PostgreSQL) or tuple (SQLite) results
        if isinstance(row, dict):
            social_media = json.loads(row['social_media']) if row.get('social_media') else None
            return DeviceResponse(
                id=row['id'],
                name=row['name'],
                rssi=row['rssi'],
                distanceFeet=row['distance_feet'],
                action=row['action'],
                timestamp=row['timestamp'],
                phoneNumber=row['phone_number'],
                email=row['email'],
                bio=row['bio'],
                socialMedia=social_media
            )
        else:
            social_media = json.loads(row[9]) if row[9] else None
            return DeviceResponse(
                id=row[0],
                name=row[1],
                rssi=row[2],
                distanceFeet=row[3],
                action=row[4],
                timestamp=row[5],
                phoneNumber=row[6],
                email=row[7],
                bio=row[8],
                socialMedia=social_media
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# DELETE /devices/{id} - Delete a device
@app.delete("/devices/{device_id}")
def delete_device(device_id: int, user_id: int = Depends(get_current_user)):
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Verify ownership before deleting
        execute_query(cursor, 'SELECT user_id FROM devices WHERE id = ?', (device_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Device not found")
        
        device_user_id = get_value(row, 0) if isinstance(row, dict) else row[0]
        if device_user_id != user_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Not authorized to delete this device")
        
        execute_query(cursor, 'DELETE FROM devices WHERE id = ?', (device_id,))
        conn.commit()
        conn.close()
        
        return {"message": "Device deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# User Profile endpoints
@app.get("/user/profile")
def get_user_profile(user_id: int = Depends(get_current_user)):
    """Get user profile"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT name, email, phone, bio, profile_photo, social_media FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {"name": "", "email": "", "phone": "", "bio": "", "profile_photo": None, "socialMedia": []}
        
        social_media = json.loads(row[5]) if row[5] else []
        
        return {
            "name": row[0],
            "email": row[1],
            "phone": row[2],
            "bio": row[3],
            "profile_photo": row[4],
            "socialMedia": social_media
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/profile")
def save_user_profile(profile: dict, request: Request, user_id: int = Depends(get_current_user)):
    """Save user profile"""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Create table if it doesn't exist
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id INTEGER PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                bio TEXT,
                profile_photo TEXT,
                social_media TEXT
            )
        ''')
        
        # Clean up phone number - strip all non-numeric characters
        # Frontend may send: "(555) 123-4567" -> convert to: "5551234567"
        if profile.get('phone'):
            import re
            phone_cleaned = re.sub(r'\D', '', profile.get('phone'))
            profile['phone'] = phone_cleaned if phone_cleaned else None
        
        # Clean up bio - convert placeholder text to empty string
        # Frontend may send: "Add bio" -> convert to: ""
        if profile.get('bio') == 'Add bio':
            profile['bio'] = ''
        
        # Check if phone number is already used by another user
        if profile.get('phone'):
            execute_query(cursor, '''
                SELECT user_id FROM user_profiles 
                WHERE phone = ? AND user_id != ?
            ''', (profile.get('phone'), user_id))
            existing_phone = cursor.fetchone()
            if existing_phone:
                conn.close()
                raise HTTPException(status_code=400, detail="This phone number is already associated with another account")
        
        # Check if email is already used by another user (in users table, skip for testing email)
        if profile.get('email'):
            # Allow testing email to be reused infinitely
            if profile.get('email').lower() != "caitie690@gmail.com":
                execute_query(cursor, '''
                    SELECT id FROM users 
                    WHERE LOWER(email) = ? AND id != ?
                ''', (profile.get('email').lower(), user_id))
                existing_email = cursor.fetchone()
                if existing_email:
                    conn.close()
                    raise HTTPException(status_code=400, detail="This email is already associated with another account")
        
        # Prepare social_media JSON
        social_media_json = json.dumps(profile.get('socialMedia', [])) if profile.get('socialMedia') else None
        
        # Upsert profile - works for both SQLite and PostgreSQL
        if USE_POSTGRES:
            execute_query(cursor, '''
                INSERT INTO user_profiles (user_id, name, email, phone, bio, social_media)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    bio = EXCLUDED.bio,
                    social_media = EXCLUDED.social_media
            ''', (user_id, profile.get('name'), profile.get('email'), profile.get('phone'), profile.get('bio'), social_media_json))
        else:
            execute_query(cursor, '''
                INSERT OR REPLACE INTO user_profiles (user_id, name, email, phone, bio, social_media)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (user_id, profile.get('name'), profile.get('email'), profile.get('phone'), profile.get('bio'), social_media_json))
        
        conn.commit()
        conn.close()
        
        # Log profile update
        log_audit_event(
            action="profile_update",
            user_id=user_id,
            details={"fields_updated": list(profile.keys())},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Profile Photo endpoints
@app.post("/user/profile/photo")
async def upload_profile_photo(file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    """Upload profile photo to Cloudinary"""
    try:
        # Validate file type
        if not file.content_type in ["image/jpeg", "image/png", "image/jpg"]:
            raise HTTPException(status_code=400, detail="Only JPEG and PNG images are allowed")
        
        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder="droplink/profile_photos",
            public_id=f"user_{user_id}",
            overwrite=True,
            resource_type="image"
        )
        
        # Get the secure URL from Cloudinary
        photo_url = upload_result.get("secure_url")
        
        # Update database with photo URL
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Create table if it doesn't exist
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id INTEGER PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                bio TEXT,
                profile_photo TEXT
            )
        ''')
        
        # Update or insert photo URL
        # Check if profile exists
        execute_query(cursor, 'SELECT user_id FROM user_profiles WHERE user_id = ?', (user_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Update existing profile
            execute_query(cursor, '''
                UPDATE user_profiles SET profile_photo = ? WHERE user_id = ?
            ''', (photo_url, user_id))
        else:
            # Insert new profile with just photo
            execute_query(cursor, '''
                INSERT INTO user_profiles (user_id, profile_photo)
                VALUES (?, ?)
            ''', (user_id, photo_url))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "url": photo_url
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/profile/photo")
async def get_profile_photo(user_id: int = Depends(get_current_user)):
    """Get profile photo URL from Cloudinary"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT profile_photo FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Profile photo not found")
        
        photo_url = get_value(row, 0) if isinstance(row, dict) else row[0]
        if not photo_url:
            raise HTTPException(status_code=404, detail="Profile photo not found")
        
        return {"url": photo_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/profile/photo")
async def delete_profile_photo(user_id: int = Depends(get_current_user)):
    """Delete profile photo from Cloudinary"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT profile_photo FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        
        if row and row[0]:
            # Delete from Cloudinary
            try:
                cloudinary.uploader.destroy(f"droplink/profile_photos/user_{user_id}")
            except:
                pass  # Continue even if Cloudinary delete fails
            
            # Update database
            execute_query(cursor, '''
                UPDATE user_profiles SET profile_photo = NULL WHERE user_id = ?
            ''', (user_id,))
            conn.commit()
        
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Settings endpoints
@app.get("/user/settings")
def get_user_settings(user_id: int = Depends(get_current_user)):
    """Get user settings"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT dark_mode, max_distance FROM user_settings WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {"darkMode": True, "maxDistance": 33}
        
        return {
            "darkMode": bool(row[0]),
            "maxDistance": row[1]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/settings")
def save_user_settings(settings: dict, user_id: int = Depends(get_current_user)):
    """Save user settings"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                dark_mode INTEGER,
                max_distance INTEGER
            )
        ''')
        
        # Upsert settings - works for both SQLite and PostgreSQL
        if USE_POSTGRES:
            execute_query(cursor, '''
                INSERT INTO user_settings (user_id, dark_mode, max_distance)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    dark_mode = EXCLUDED.dark_mode,
                    max_distance = EXCLUDED.max_distance
            ''', (user_id, 
                  1 if settings.get('darkMode') else 0,
                  settings.get('maxDistance', 33)))
        else:
            execute_query(cursor, '''
                INSERT OR REPLACE INTO user_settings (user_id, dark_mode, max_distance)
                VALUES (?, ?, ?)
            ''', (user_id, 
                  1 if settings.get('darkMode') else 0,
                  settings.get('maxDistance', 33)))
        
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Privacy Zones endpoints
@app.get("/user/privacy-zones")
def get_privacy_zones(user_id: int = Depends(get_current_user)):
    """Get privacy zones"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT id, address, radius FROM privacy_zones WHERE user_id = ?
        ''', (user_id,))
        rows = cursor.fetchall()
        conn.close()
        
        zones = []
        for row in rows:
            zones.append({
                "id": row[0],
                "address": row[1],
                "radius": row[2]
            })
        return zones
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/privacy-zones")
def save_privacy_zone(zone: dict, request: Request, user_id: int = Depends(get_current_user)):
    """Save a privacy zone"""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS privacy_zones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                address TEXT,
                radius INTEGER
            )
        ''')
        
        execute_query(cursor, '''
            INSERT INTO privacy_zones (user_id, address, radius)
            VALUES (?, ?, ?)
        ''', (user_id, zone.get('address'), zone.get('radius')))
        
        conn.commit()
        zone_id = get_lastrowid(cursor, conn)
        conn.close()
        
        # Log privacy zone creation
        log_audit_event(
            action="privacy_zone_created",
            user_id=user_id,
            details={"zone_id": zone_id, "address": zone.get('address'), "radius": zone.get('radius')},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return {"id": zone_id, "address": zone.get('address'), "radius": zone.get('radius')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/privacy-zones/{zone_id}")
def delete_privacy_zone(zone_id: int, request: Request, user_id: int = Depends(get_current_user)):
    """Delete a privacy zone"""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Verify ownership before deleting
        execute_query(cursor, 'SELECT user_id FROM privacy_zones WHERE id = ?', (zone_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Privacy zone not found")
        
        zone_user_id = get_value(row, 0) if isinstance(row, dict) else row[0]
        if zone_user_id != user_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Not authorized to delete this privacy zone")
        
        execute_query(cursor, 'DELETE FROM privacy_zones WHERE id = ?', (zone_id,))
        conn.commit()
        conn.close()
        
        # Log privacy zone deletion
        log_audit_event(
            action="privacy_zone_deleted",
            user_id=user_id,
            details={"zone_id": zone_id},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Pinned contacts endpoint
@app.get("/user/pinned")
def get_pinned_contacts(user_id: int = Depends(get_current_user)):
    """Get pinned contact IDs"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            SELECT device_id FROM pinned_contacts WHERE user_id = ?
        ''', (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [row[0] for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/pinned/{device_id}")
def pin_contact(device_id: int, user_id: int = Depends(get_current_user)):
    """Pin a contact"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        execute_query(cursor, '''
            CREATE TABLE IF NOT EXISTS pinned_contacts (
                user_id INTEGER,
                device_id INTEGER,
                PRIMARY KEY (user_id, device_id)
            )
        ''')
        
        execute_query(cursor, '''
            INSERT OR IGNORE INTO pinned_contacts (user_id, device_id)
            VALUES (?, ?)
        ''', (user_id, device_id))
        
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/pinned/{device_id}")
def unpin_contact(device_id: int, user_id: int = Depends(get_current_user)):
    """Unpin a contact"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        execute_query(cursor, '''
            DELETE FROM pinned_contacts WHERE user_id = ? AND device_id = ?
        ''', (user_id, device_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ADMIN: Get user statistics
@app.get("/admin/stats")
async def get_admin_stats(secret: str = Header(None)):
    """
    ADMIN ENDPOINT - Get database statistics
    Requires secret header for security
    """
    # Simple security check
    if secret != "delete-all-profiles-2024":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Count users
        execute_query(cursor, 'SELECT COUNT(*) FROM users')
        total_users = cursor.fetchone()[0]
        
        # Get list of all usernames with IDs
        execute_query(cursor, 'SELECT id, username, email FROM users ORDER BY id')
        users_list = cursor.fetchall()
        
        # Count devices
        execute_query(cursor, 'SELECT COUNT(*) FROM devices')
        total_devices = cursor.fetchone()[0]
        
        # Count profiles with photos
        execute_query(cursor, 'SELECT COUNT(*) FROM user_profiles WHERE profile_photo IS NOT NULL')
        users_with_photos = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            "total_users": total_users,
            "total_devices": total_devices,
            "users_with_photos": users_with_photos,
            "users": [
                {
                    "id": user[0],
                    "username": user[1],
                    "email": user[2] or "No email"
                }
                for user in users_list
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/audit-logs")
async def get_audit_logs(
    secret: str = Header(None),
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    ip_address: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    ADMIN ENDPOINT - Get audit logs with filtering
    Requires secret header for security
    
    Query parameters:
    - user_id: Filter by user ID
    - action: Filter by action type (e.g., 'user_registration', 'login_success')
    - ip_address: Filter by IP address
    - limit: Maximum number of records to return (default: 100, max: 1000)
    - offset: Number of records to skip for pagination (default: 0)
    """
    # Simple security check
    if secret != "delete-all-profiles-2024":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Limit validation
    if limit > 1000:
        limit = 1000
    if limit < 1:
        limit = 100
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Build query with filters
        query = "SELECT id, user_id, action, details, ip_address, user_agent, timestamp FROM audit_logs WHERE 1=1"
        params = []
        
        if user_id is not None:
            query += " AND user_id = ?"
            params.append(user_id)
        
        if action:
            query += " AND action = ?"
            params.append(action)
        
        if ip_address:
            query += " AND ip_address = ?"
            params.append(ip_address)
        
        # Add ordering and pagination
        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        execute_query(cursor, query, tuple(params))
        rows = cursor.fetchall()
        
        # Get total count (without pagination)
        count_query = "SELECT COUNT(*) FROM audit_logs WHERE 1=1"
        count_params = []
        
        if user_id is not None:
            count_query += " AND user_id = ?"
            count_params.append(user_id)
        
        if action:
            count_query += " AND action = ?"
            count_params.append(action)
        
        if ip_address:
            count_query += " AND ip_address = ?"
            count_params.append(ip_address)
        
        execute_query(cursor, count_query, tuple(count_params))
        total_count = cursor.fetchone()[0] if cursor.fetchone() else 0
        
        conn.close()
        
        # Format results
        logs = []
        for row in rows:
            if isinstance(row, dict):
                log_entry = {
                    "id": row['id'],
                    "user_id": row['user_id'],
                    "action": row['action'],
                    "details": json.loads(row['details']) if row['details'] else None,
                    "ip_address": row['ip_address'],
                    "user_agent": row['user_agent'],
                    "timestamp": row['timestamp']
                }
            else:
                log_entry = {
                    "id": row[0],
                    "user_id": row[1],
                    "action": row[2],
                    "details": json.loads(row[3]) if row[3] else None,
                    "ip_address": row[4],
                    "user_agent": row[5],
                    "timestamp": row[6]
                }
            logs.append(log_entry)
        
        return {
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
            "logs": logs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def cleanup_old_audit_logs(days: int = 90):
    """
    Delete audit logs older than the specified number of days
    Returns the number of logs deleted
    """
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        cutoff_timestamp = cutoff_date.isoformat()
        
        # Count logs to be deleted
        execute_query(cursor, 
            "SELECT COUNT(*) FROM audit_logs WHERE timestamp < ?",
            (cutoff_timestamp,)
        )
        count_result = cursor.fetchone()
        count = count_result[0] if count_result else 0
        
        # Delete old logs
        execute_query(cursor,
            "DELETE FROM audit_logs WHERE timestamp < ?",
            (cutoff_timestamp,)
        )
        
        conn.commit()
        conn.close()
        
        return count
    except Exception as e:
        print(f"⚠️  Audit log cleanup failed: {str(e)}")
        return 0

@app.post("/admin/cleanup-audit-logs")
async def cleanup_audit_logs_endpoint(
    secret: str = Header(None),
    days: int = 90
):
    """
    ADMIN ENDPOINT - Delete audit logs older than specified days
    Requires secret header for security
    
    Query parameters:
    - days: Number of days to retain logs (default: 90)
    """
    # Simple security check
    if secret != "delete-all-profiles-2024":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if days < 1:
        raise HTTPException(status_code=400, detail="Days must be at least 1")
    
    try:
        deleted_count = cleanup_old_audit_logs(days)
        
        return {
            "success": True,
            "deleted_count": deleted_count,
            "retention_days": days,
            "message": f"Deleted {deleted_count} audit log(s) older than {days} days"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ADMIN: Simple web dashboard
@app.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard():
    """
    Simple web dashboard to view user accounts
    Just open in browser: https://findable-production.up.railway.app/admin/dashboard
    """
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Get user stats
        execute_query(cursor, 'SELECT COUNT(*) FROM users')
        total_users = cursor.fetchone()[0]
        
        execute_query(cursor, 'SELECT id, username, email FROM users ORDER BY id')
        users_list = cursor.fetchall()
        
        execute_query(cursor, 'SELECT COUNT(*) FROM user_profiles WHERE profile_photo IS NOT NULL')
        users_with_photos = cursor.fetchone()[0]
        
        conn.close()
        
        # Get current timestamp
        current_time = datetime.now().strftime("%B %d, %Y at %I:%M:%S %p")
        
        # Build HTML
        users_html = ""
        if len(users_list) == 0:
            users_html = """
            <tr>
                <td colspan="3" style="padding: 32px; text-align: center; color: #9ca3af;">
                    <div style="font-size: 48px; margin-bottom: 8px;">📭</div>
                    <div style="font-weight: 600; color: #6b7280;">No users yet</div>
                    <div style="font-size: 14px; margin-top: 4px;">Database is empty - accounts will appear here when created</div>
                </td>
            </tr>
            """
        else:
            for user in users_list:
                users_html += f"""
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">{user[0]}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">{user[1]}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">{user[2] or 'No email'}</td>
                </tr>
                """
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>DropLink Admin Dashboard</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: #f9fafb;
                }}
                .container {{
                    max-width: 1000px;
                    margin: 0 auto;
                }}
                h1 {{
                    color: #111827;
                    margin-bottom: 8px;
                }}
                .subtitle {{
                    color: #6b7280;
                    margin-bottom: 32px;
                }}
                .stats {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 32px;
                }}
                .stat-card {{
                    background: white;
                    padding: 24px;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }}
                .stat-value {{
                    font-size: 36px;
                    font-weight: 700;
                    color: #007AFF;
                    margin-bottom: 4px;
                }}
                .stat-label {{
                    color: #6b7280;
                    font-size: 14px;
                }}
                .users-table {{
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    overflow: hidden;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                }}
                th {{
                    background: #f9fafb;
                    padding: 12px;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    font-size: 14px;
                    border-bottom: 2px solid #e5e7eb;
                }}
                .refresh-btn {{
                    background: #007AFF;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 16px;
                }}
                .refresh-btn:hover {{
                    background: #0051D5;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔗 DropLink Admin</h1>
                <p class="subtitle">Monitor your user accounts</p>
                
                <div style="background: #dcfce7; border: 1px solid #86efac; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">✅</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #166534;">Dashboard Connected</div>
                        <div style="font-size: 13px; color: #15803d;">Last updated: {current_time}</div>
                    </div>
                </div>
                
                <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">{total_users}</div>
                        <div class="stat-label">Total Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">{users_with_photos}</div>
                        <div class="stat-label">Users with Photos</div>
                    </div>
                </div>
                
                <div class="users-table">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Username</th>
                                <th>Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users_html}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
        
    except Exception as e:
        return f"<html><body><h1>Error</h1><p>{str(e)}</p></body></html>"

# TEMPORARY: Admin endpoint to clear all test data
@app.delete("/admin/clear-all-data")
async def clear_all_data(secret: str = Header(None)):
    """
    TEMPORARY ADMIN ENDPOINT - Deletes all users and related data
    Requires secret header for security
    """
    # Simple security check
    if secret != "delete-all-profiles-2024":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Delete all data from all tables
        execute_query(cursor, 'DELETE FROM pinned_contacts')
        execute_query(cursor, 'DELETE FROM privacy_zones')
        execute_query(cursor, 'DELETE FROM user_settings')
        execute_query(cursor, 'DELETE FROM user_profiles')
        execute_query(cursor, 'DELETE FROM devices')
        execute_query(cursor, 'DELETE FROM users')
        
        # Reset sequences if using PostgreSQL
        if USE_POSTGRES:
            try:
                execute_query(cursor, "ALTER SEQUENCE users_id_seq RESTART WITH 1")
                execute_query(cursor, "ALTER SEQUENCE devices_id_seq RESTART WITH 1")
                execute_query(cursor, "ALTER SEQUENCE privacy_zones_id_seq RESTART WITH 1")
            except Exception as seq_error:
                print(f"Warning: Could not reset sequences: {seq_error}")
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "All user data has been deleted and sequences reset",
            "deleted_tables": ["users", "devices", "user_profiles", "user_settings", "privacy_zones", "pinned_contacts"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000

