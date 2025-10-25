from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
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
import smtplib
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = FastAPI(title="DropLink API")

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

# Email Configuration (Gmail SMTP)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "your-email@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "your-app-password")

# Temporary storage for verification codes (email -> {code, expires_at})
# In production, use Redis or database
verification_codes = {}

# Enable CORS for React Native app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your mobile app domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
def init_db():
    conn = sqlite3.connect('droplink.db')
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Devices table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rssi INTEGER NOT NULL,
            distance_feet REAL NOT NULL,
            action TEXT,
            timestamp TEXT,
            phone_number TEXT,
            email TEXT,
            bio TEXT,
            social_media TEXT,
            user_id INTEGER DEFAULT 1
        )
    ''')
    
    # User profiles table (if not exists)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY,
            name TEXT,
            phone TEXT,
            email TEXT,
            bio TEXT,
            social_media TEXT,
            profile_photo TEXT
        )
    ''')
    
    # User settings table (if not exists)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            dark_mode INTEGER DEFAULT 0,
            max_distance INTEGER DEFAULT 50
        )
    ''')
    
    # Privacy zones table (if not exists)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS privacy_zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            address TEXT NOT NULL,
            radius REAL NOT NULL
        )
    ''')
    
    # Pinned contacts table (if not exists)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pinned_contacts (
            user_id INTEGER NOT NULL,
            device_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, device_id)
        )
    ''')
    
    conn.commit()
    conn.close()

init_db()

# Pydantic models
class DeviceCreate(BaseModel):
    name: str
    rssi: int
    distance: float  # Frontend sends distanceFeet as "distance"
    action: Optional[str] = "dropped"
    timestamp: Optional[str] = None
    phoneNumber: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None
    socialMedia: Optional[List[dict]] = None
    user_id: Optional[int] = 1

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
    username: str
    password: str
    email: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

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
    """Send verification code via email"""
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = SMTP_EMAIL
        msg['To'] = email
        msg['Subject'] = 'DropLink - Your Verification Code'
        
        # Email body
        html_body = f"""
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
        
        text_body = f"""
        Welcome to DropLink!
        
        Your verification code is: {code}
        
        This code will expire in 10 minutes.
        
        If you didn't request this code, please ignore this email.
        """
        
        # Attach both plain text and HTML versions
        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
            
        return True
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        return False

# ========== AUTH ENDPOINTS ==========

@app.post("/auth/register", response_model=AuthResponse)
def register(request: RegisterRequest):
    """Register a new user"""
    try:
        # Validate username (3-20 chars, alphanumeric + underscore)
        if not request.username or len(request.username) < 3 or len(request.username) > 20:
            raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
        
        if not request.username.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, and underscores")
        
        # Validate password (8+ chars, uppercase, lowercase, number)
        if len(request.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        if not any(c.isupper() for c in request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        
        if not any(c in "!@#$%^&*()_+-=[]{}; ':\"\\|,.<>/?" for c in request.password):
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")
        
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Check if username already exists
        cursor.execute("SELECT id FROM users WHERE username = ?", (request.username,))
        existing = cursor.fetchone()
        if existing:
            conn.close()
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Hash password and create user
        password_hash = hash_password(request.password)
        cursor.execute(
            "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
            (request.username, password_hash, request.email)
        )
        user_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        
        # Create JWT token
        token = create_access_token(user_id, request.username)
        
        return AuthResponse(
            token=token,
            user_id=user_id,
            username=request.username
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/login", response_model=AuthResponse)
def login(request: LoginRequest):
    """Login with username and password"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Find user by username
        cursor.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (request.username,)
        )
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        user_id, username, password_hash = user
        
        # Verify password
        if not verify_password(request.password, password_hash):
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Check if user with this email already exists
        cursor.execute(
            "SELECT id, username FROM users WHERE email = ?",
            (email,)
        )
        existing_user = cursor.fetchone()
        
        if existing_user:
            # User already exists, log them in
            user_id, username = existing_user
        else:
            # Create new user with a dummy password (they'll use Google OAuth)
            # Make username unique by appending number if needed
            base_username = username
            counter = 1
            while True:
                cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                if not cursor.fetchone():
                    break
                username = f"{base_username}{counter}"
                counter += 1
            
            # Insert new user with Google OAuth marker
            dummy_password_hash = hash_password(f"google_oauth_{google_user_id}")
            cursor.execute(
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                (username, dummy_password_hash, email)
            )
            conn.commit()
            user_id = cursor.lastrowid
            
            # Also create initial user profile
            cursor.execute(
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
        
        # Send email
        success = send_verification_email(email, code)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send verification email. Please check your email address.")
        
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

@app.post("/auth/change-username")
def change_username(new_username: str, user_id: int = Depends(get_current_user)):
    """Change username for authenticated user"""
    try:
        # Validate new username
        if not new_username or len(new_username) < 3 or len(new_username) > 20:
            raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
        
        if not new_username.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, and underscores")
        
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Check if new username is already taken
        cursor.execute("SELECT id FROM users WHERE username = ? AND id != ?", (new_username, user_id))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Update username
        cursor.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user_id))
        conn.commit()
        conn.close()
        
        # Create new JWT token with updated username
        token = create_access_token(user_id, new_username)
        
        return {
            "success": True,
            "message": "Username changed successfully",
            "token": token,
            "username": new_username
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
        
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Get current password hash
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            raise HTTPException(status_code=404, detail="User not found")
        
        current_hash = user[0]
        
        # Verify current password
        if not verify_password(current_password, current_hash):
            conn.close()
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        # Hash and update new password
        new_hash = hash_password(new_password)
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
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
def create_device(device: DeviceCreate):
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        social_media_json = json.dumps(device.socialMedia) if device.socialMedia else None
        timestamp = device.timestamp or datetime.now().isoformat()
        
        # Check if device with same name already exists for this user
        cursor.execute('''
            SELECT id FROM devices WHERE name = ? AND user_id = ?
        ''', (device.name, device.user_id))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing device
            device_id = existing[0]
            cursor.execute('''
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
            cursor.execute('''
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
                device.user_id
            ))
            device_id = cursor.lastrowid
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
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
def get_device(device_id: int):
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, rssi, distance_feet, action, timestamp,
                   phone_number, email, bio, social_media
            FROM devices 
            WHERE id = ?
        ''', (device_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Device not found")
        
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
def delete_device(device_id: int):
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('DELETE FROM devices WHERE id = ?', (device_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="Device not found")
        
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT name, email, phone, bio, profile_photo FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {"name": "", "email": "", "phone": "", "bio": "", "profile_photo": None}
        
        return {
            "name": row[0],
            "email": row[1],
            "phone": row[2],
            "bio": row[3],
            "profile_photo": row[4]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/profile")
def save_user_profile(profile: dict, user_id: int = Depends(get_current_user)):
    """Save user profile"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Create table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id INTEGER PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                bio TEXT,
                profile_photo TEXT
            )
        ''')
        
        # Upsert profile
        cursor.execute('''
            INSERT OR REPLACE INTO user_profiles (user_id, name, email, phone, bio)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, profile.get('name'), profile.get('email'), profile.get('phone'), profile.get('bio')))
        
        conn.commit()
        conn.close()
        return {"success": True}
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Create table if it doesn't exist
        cursor.execute('''
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
        cursor.execute('SELECT user_id FROM user_profiles WHERE user_id = ?', (user_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Update existing profile
            cursor.execute('''
                UPDATE user_profiles SET profile_photo = ? WHERE user_id = ?
            ''', (photo_url, user_id))
        else:
            # Insert new profile with just photo
            cursor.execute('''
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

@app.get("/user/profile/photo/{user_id}")
async def get_profile_photo(user_id: int):
    """Get profile photo URL from Cloudinary"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT profile_photo FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Profile photo not found")
        
        return {"url": row[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/profile/photo")
async def delete_profile_photo(user_id: int = Depends(get_current_user)):
    """Delete profile photo from Cloudinary"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
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
            cursor.execute('''
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT dark_mode, max_distance FROM user_settings WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {"darkMode": False, "maxDistance": 33}
        
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                dark_mode INTEGER,
                max_distance INTEGER
            )
        ''')
        
        cursor.execute('''
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS privacy_zones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                address TEXT,
                radius INTEGER
            )
        ''')
        
        cursor.execute('''
            INSERT INTO privacy_zones (user_id, address, radius)
            VALUES (?, ?, ?)
        ''', (user_id, zone.get('address'), zone.get('radius')))
        
        conn.commit()
        zone_id = cursor.lastrowid
        conn.close()
        return {"id": zone_id, "address": zone.get('address'), "radius": zone.get('radius')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/privacy-zones/{zone_id}")
def delete_privacy_zone(zone_id: int):
    """Delete a privacy zone"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('DELETE FROM privacy_zones WHERE id = ?', (zone_id,))
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pinned_contacts (
                user_id INTEGER,
                device_id INTEGER,
                PRIMARY KEY (user_id, device_id)
            )
        ''')
        
        cursor.execute('''
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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            DELETE FROM pinned_contacts WHERE user_id = ? AND device_id = ?
        ''', (user_id, device_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        # Delete all data from all tables
        cursor.execute('DELETE FROM pinned_contacts')
        cursor.execute('DELETE FROM privacy_zones')
        cursor.execute('DELETE FROM user_settings')
        cursor.execute('DELETE FROM user_profiles')
        cursor.execute('DELETE FROM devices')
        cursor.execute('DELETE FROM users')
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "All user data has been deleted",
            "deleted_tables": ["users", "devices", "user_profiles", "user_settings", "privacy_zones", "pinned_contacts"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000

