from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sqlite3
import json
import os
import shutil
from pathlib import Path

app = FastAPI(title="DropLink API")

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("uploads/profile_photos")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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
def get_devices(user_id: int = 1):
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
def get_user_profile(user_id: int = 1):
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
            return {"name": "", "email": "", "phone": "", "bio": "", "profilePhoto": None}
        
        return {
            "name": row[0],
            "email": row[1],
            "phone": row[2],
            "bio": row[3],
            "profilePhoto": row[4]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/profile")
def save_user_profile(profile: dict, user_id: int = 1):
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
async def upload_profile_photo(file: UploadFile = File(...), user_id: int = 1):
    """Upload profile photo"""
    try:
        # Validate file type
        if not file.content_type in ["image/jpeg", "image/png", "image/jpg"]:
            raise HTTPException(status_code=400, detail="Only JPEG and PNG images are allowed")
        
        # Create unique filename
        file_extension = file.filename.split(".")[-1]
        filename = f"user_{user_id}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update database with photo path
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
        
        # Update or insert photo path
        # Check if profile exists
        cursor.execute('SELECT user_id FROM user_profiles WHERE user_id = ?', (user_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Update existing profile
            cursor.execute('''
                UPDATE user_profiles SET profile_photo = ? WHERE user_id = ?
            ''', (str(filename), user_id))
        else:
            # Insert new profile with just photo
            cursor.execute('''
                INSERT INTO user_profiles (user_id, profile_photo)
                VALUES (?, ?)
            ''', (user_id, str(filename)))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "filename": filename,
            "url": f"/user/profile/photo/{user_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/profile/photo/{user_id}")
async def get_profile_photo(user_id: int):
    """Get profile photo"""
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
        
        file_path = UPLOAD_DIR / row[0]
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Photo file not found")
        
        return FileResponse(file_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/profile/photo")
async def delete_profile_photo(user_id: int = 1):
    """Delete profile photo"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT profile_photo FROM user_profiles WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        
        if row and row[0]:
            # Delete file
            file_path = UPLOAD_DIR / row[0]
            if file_path.exists():
                os.remove(file_path)
            
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
def get_user_settings(user_id: int = 1):
    """Get user settings"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT dark_mode, max_distance, privacy_zones_enabled FROM user_settings WHERE user_id = ?
        ''', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {"darkMode": False, "maxDistance": 33, "privacyZonesEnabled": False}
        
        return {
            "darkMode": bool(row[0]),
            "maxDistance": row[1],
            "privacyZonesEnabled": bool(row[2])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/settings")
def save_user_settings(settings: dict, user_id: int = 1):
    """Save user settings"""
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                dark_mode INTEGER,
                max_distance INTEGER,
                privacy_zones_enabled INTEGER
            )
        ''')
        
        cursor.execute('''
            INSERT OR REPLACE INTO user_settings (user_id, dark_mode, max_distance, privacy_zones_enabled)
            VALUES (?, ?, ?, ?)
        ''', (user_id, 
              1 if settings.get('darkMode') else 0,
              settings.get('maxDistance', 33),
              1 if settings.get('privacyZonesEnabled') else 0))
        
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Privacy Zones endpoints
@app.get("/user/privacy-zones")
def get_privacy_zones(user_id: int = 1):
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
def save_privacy_zone(zone: dict, user_id: int = 1):
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
def get_pinned_contacts(user_id: int = 1):
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
def pin_contact(device_id: int, user_id: int = 1):
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
def unpin_contact(device_id: int, user_id: int = 1):
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

# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000

