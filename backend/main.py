from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Float, DateTime, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
import logging
import datetime

engine = create_engine('sqlite:///./database.db')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Device(Base):
    __tablename__ = 'devices'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    rssi = Column(Float)
    distance = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(Integer)

Base.metadata.create_all(bind=engine)

class DeviceBase(BaseModel):
    name: str
    rssi: float
    distance: float
    user_id: int

class DeviceCreate(DeviceBase):
    pass

class DeviceRead(DeviceBase):
    id: int
    timestamp: datetime.datetime

    class Config:
        from_attributes = True

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/devices", response_model=DeviceRead)
def create_device(device: DeviceCreate):
    db = SessionLocal()
    db_device = Device(**device.dict())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    db.close()
    return db_device

@app.get("/devices", response_model=List[DeviceRead])
def read_devices(skip: int = 0, limit: int = 100):
    db = SessionLocal()
    devices = db.query(Device).offset(skip).limit(limit).all()
    db.close()
    return devices

@app.get("/devices/{device_id}", response_model=DeviceRead)
def read_device(device_id: int):
    db = SessionLocal()
    device = db.query(Device).filter(Device.id == device_id).first()
    db.close()
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device
