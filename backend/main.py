from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sqlite3
import json

app = FastAPI(title="DropLink API")

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

# POST /devices - Save a new device
@app.post("/devices", response_model=DeviceResponse)
def create_device(device: DeviceCreate):
    try:
        conn = sqlite3.connect('droplink.db')
        cursor = conn.cursor()
        
        social_media_json = json.dumps(device.socialMedia) if device.socialMedia else None
        timestamp = device.timestamp or datetime.now().isoformat()
        
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
        
        conn.commit()
        device_id = cursor.lastrowid
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

# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000

