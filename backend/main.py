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
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import cloudinary
import cloudinary.uploader
import random
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content

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

# JWT Secret Key (in production, use environment variable)
SECRET_KEY = "your-secret-key-change-in-production-12345"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Google OAuth Client ID (in production, use environment variable)
GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID_HERE"  # Will be configured later

# Cloudinary Configuration
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", "ddxxjia44"),
    api_key=os.environ.get("CLOUDINARY_API_KEY", "213846241467723"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", "3ICj-oLAW4HZm8EVCQuImb53R5Y")
)

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@droplinkconnect.com")

# Temporary storage for verification codes (email -> {code, expires_at})
# In production, use Redis or database
verification_codes = {}

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your mobile app domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            created_at {timestamp_default}
        )
    ''')
    
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
    password: constr(min_length=8, max_length=128) = Field(..., description="Password (min 8 chars, must include uppercase, lowercase, number, special char)")
    email: Optional[constr(max_length=100)] = Field(None, description="Email address (optional)")
    
    @validator('username', pre=True)
    def validate_username(cls, v):
        return validate_username_format(v)
    
    @validator('email', pre=True)
    def validate_email(cls, v):
        if v is None or v == '':
            return None
        return validate_email_format(v)
    
    @validator('password', pre=True)
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in v):
            raise ValueError("Password must contain at least one special character")
        return v

class LoginRequest(BaseModel):
    username: constr(min_length=3, max_length=20) = Field(..., description="Username")
    password: constr(min_length=1, max_length=128) = Field(..., description="Password")
    
    @validator('username', pre=True)
    def sanitize_username(cls, v):
        return v.strip().lower() if v else v

class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class SendVerificationCodeRequest(BaseModel):
    email: str

class VerifyCodeRequest(BaseModel):
    email: str
    code: str

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

def create_access_token(user_id: int, username: str) -> str:
    """Create a JWT access token"""
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": expire
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token

def verify_token(token: str) -> dict:
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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

# ========== AUTH ENDPOINTS ==========

@app.post("/auth/register", response_model=AuthResponse)
def register(register_request: RegisterRequest):
    """Register a new user"""
    try:
        # Convert username to lowercase for case-insensitive storage
        username_lower = register_request.username.lower()
        
        # Validate username (3-20 chars, alphanumeric + underscore)
        if not username_lower or len(username_lower) < 3 or len(username_lower) > 20:
            raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
        
        if not username_lower.replace('_', '').replace('.', '').isalnum():
            raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, underscores, and periods")
        
        # Validate password (8+ chars, uppercase, lowercase, number)
        if len(register_request.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        if not any(c.isupper() for c in register_request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in register_request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in register_request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in register_request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if username already exists (case-insensitive)
        execute_query(cursor, "SELECT id FROM users WHERE LOWER(username) = ?", (username_lower,))
        existing = cursor.fetchone()
        if existing:
            conn.close()
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Check if email already exists
        if register_request.email:
            execute_query(cursor, "SELECT id FROM users WHERE LOWER(email) = ?", (register_request.email.lower(),))
            existing_email = cursor.fetchone()
            if existing_email:
                conn.close()
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
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/login", response_model=AuthResponse)
def login(login_request: LoginRequest):
    """Login with username and password"""
    try:
        username_lower = login_request.username.lower()  # Convert to lowercase
        
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Find user by username (case-insensitive)
        execute_query(cursor,
            "SELECT id, username, password_hash FROM users WHERE LOWER(username) = ?",
            (username_lower,)
        )
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Handle both dict (PostgreSQL) and tuple (SQLite) results
        if isinstance(user, dict):
            user_id, username, password_hash = user['id'], user['username'], user['password_hash']
        else:
            user_id, username, password_hash = user
        
        # Verify password
        if not verify_password(login_request.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Create JWT token
        token = create_access_token(user_id, username)
        
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
def refresh_token(user_id: int = Depends(get_current_user)):
    """Refresh JWT token"""
    try:
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
        
        # Create new JWT token
        new_token = create_access_token(user_id, username)
        
        return AuthResponse(
            token=new_token,
            user_id=user_id,
            username=username
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")

@app.post("/auth/google", response_model=AuthResponse)
def google_auth(request: GoogleAuthRequest):
    """Authenticate with Google OAuth"""
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            request.id_token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        
        # Get user info from Google token
        google_user_id = idinfo['sub']
        email = idinfo.get('email', '')
        name = idinfo.get('name', '')
        
        # Generate username from email or name
        username = email.split('@')[0] if email else name.replace(' ', '').lower()
        
        # Ensure username is unique
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        # Check if user with this email already exists
        execute_query(cursor, 
            "SELECT id, username FROM users WHERE email = ?",
            (email,)
        )
        existing_user = cursor.fetchone()
        
        if existing_user:
            # User already exists, log them in
            if isinstance(existing_user, dict):
                user_id, username = existing_user['id'], existing_user['username']
            else:
                user_id, username = existing_user
        else:
            # Create new user with a dummy password (they'll use Google OAuth)
            # Make username unique by appending number if needed
            base_username = username
            counter = 1
            while True:
                execute_query(cursor, "SELECT id FROM users WHERE username = ?", (username,))
                if not cursor.fetchone():
                    break
                username = f"{base_username}{counter}"
                counter += 1
            
            # Insert new user with Google OAuth marker
            dummy_password_hash = hash_password(f"google_oauth_{google_user_id}")
            execute_query(cursor, 
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                (username, dummy_password_hash, email)
            )
            conn.commit()
            user_id = get_lastrowid(cursor, conn)
            
            # Also create initial user profile
            execute_query(cursor, 
                "INSERT OR REPLACE INTO user_profiles (user_id, name, email) VALUES (?, ?, ?)",
                (user_id, name, email)
            )
            conn.commit()
        
        conn.close()
        
        # Create JWT token
        token = create_access_token(user_id, username)
        
        return AuthResponse(
            token=token,
            user_id=user_id,
            username=username
        )
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google authentication failed: {str(e)}")

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
        
        # Store code with expiration (10 minutes)
        expires_at = datetime.now() + timedelta(minutes=10)
        verification_codes[email] = {
            'code': code,
            'expires_at': expires_at
        }
        
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
        
        # Check if code exists for this email
        if email not in verification_codes:
            raise HTTPException(status_code=400, detail="No verification code found for this email")
        
        stored_data = verification_codes[email]
        
        # Check if code has expired
        if datetime.now() > stored_data['expires_at']:
            del verification_codes[email]
            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")
        
        # Verify code
        if stored_data['code'] != code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        # Code is valid, remove it from storage
        del verification_codes[email]
        
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
def send_recovery_code(email: str, type: str):
    """Send recovery code for forgot password/username"""
    try:
        email = email.lower().strip()
        
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
        
        # Store code with expiration (10 minutes) and recovery type
        expires_at = datetime.now() + timedelta(minutes=10)
        username_value = get_value(user, 'username') if isinstance(user, dict) else user[1]
        verification_codes[f"recovery_{email}"] = {
            'code': code,
            'expires_at': expires_at,
            'type': type,
            'username': username_value
        }
        
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
def verify_recovery_code(email: str, code: str, type: str):
    """Verify recovery code and return username if username recovery"""
    try:
        email = email.lower().strip()
        code = code.strip()
        
        key = f"recovery_{email}"
        
        # Check if code exists for this email
        if key not in verification_codes:
            raise HTTPException(status_code=400, detail="No recovery code found for this email")
        
        stored_data = verification_codes[key]
        
        # Check if code has expired
        if datetime.now() > stored_data['expires_at']:
            del verification_codes[key]
            raise HTTPException(status_code=400, detail="Recovery code has expired. Please request a new one.")
        
        # Verify code
        if stored_data['code'] != code:
            raise HTTPException(status_code=400, detail="Invalid recovery code")
        
        # Verify type matches
        if stored_data['type'] != type:
            raise HTTPException(status_code=400, detail="Invalid recovery type")
        
        # For username recovery, return username and delete code
        if type == 'username':
            username = stored_data['username']
            del verification_codes[key]
            return {
                "success": True,
                "username": username,
                "message": "Username recovered successfully"
            }
        
        # For password recovery, keep code for password reset step
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
        
        key = f"recovery_{email}"
        
        # Check if code exists for this email
        if key not in verification_codes:
            raise HTTPException(status_code=400, detail="No recovery code found. Please request a new code.")
        
        stored_data = verification_codes[key]
        
        # Check if code has expired
        if datetime.now() > stored_data['expires_at']:
            del verification_codes[key]
            raise HTTPException(status_code=400, detail="Recovery code has expired. Please request a new one.")
        
        # Verify code
        if stored_data['code'] != code:
            raise HTTPException(status_code=400, detail="Invalid recovery code")
        
        # Verify type is password
        if stored_data['type'] != 'password':
            raise HTTPException(status_code=400, detail="Invalid recovery type")
        
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
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        new_hash = hash_password(new_password)
        execute_query(cursor, "UPDATE users SET password_hash = ? WHERE email = ?", (new_hash, email))
        conn.commit()
        conn.close()
        
        # Delete the used code
        del verification_codes[key]
        
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

# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy"}


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
def save_user_profile(profile: dict, user_id: int = Depends(get_current_user)):
    """Save user profile"""
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
        
        # Check if email is already used by another user (in users table)
        if profile.get('email'):
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
def save_privacy_zone(zone: dict, user_id: int = Depends(get_current_user)):
    """Save a privacy zone"""
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
        return {"id": zone_id, "address": zone.get('address'), "radius": zone.get('radius')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/privacy-zones/{zone_id}")
def delete_privacy_zone(zone_id: int, user_id: int = Depends(get_current_user)):
    """Delete a privacy zone"""
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

