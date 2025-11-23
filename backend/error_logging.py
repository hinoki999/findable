"""
Error logging endpoints and database schema for DropLink.
Add these endpoints to main.py to collect user-side errors.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
import json

# Create router for error logging endpoints
router = APIRouter(prefix="/api", tags=["error-logging"])

# ==================== DATABASE SCHEMA ====================
"""
Add these table creation statements to your database initialization in main.py:

CREATE TABLE IF NOT EXISTS errors (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    user_id INTEGER,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    screen_name VARCHAR(255),
    device_info JSONB,
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_errors_user_id ON errors(user_id);
CREATE INDEX IF NOT EXISTS idx_errors_screen_name ON errors(screen_name);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    user_id INTEGER,
    metric_name VARCHAR(255) NOT NULL,
    duration_ms INTEGER NOT NULL,
    screen_name VARCHAR(255),
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_user_id ON performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_metric_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_slow ON performance_metrics(duration_ms) WHERE duration_ms > 5000;

CREATE TABLE IF NOT EXISTS ble_errors (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    user_id INTEGER,
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    device_info JSONB,
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ble_errors_timestamp ON ble_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ble_errors_user_id ON ble_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_ble_errors_type ON ble_errors(error_type);
"""

# ==================== PYDANTIC MODELS ====================

class DeviceInfo(BaseModel):
    platform: str
    osVersion: str
    deviceModel: str
    isDevice: bool
    appVersion: Optional[str] = None

class ErrorLogRequest(BaseModel):
    message: str
    stack: Optional[str] = None
    screenName: Optional[str] = None
    userId: Optional[Any] = None
    deviceInfo: DeviceInfo
    timestamp: str

    class Config:
        extra = "allow"  # Allow additional fields

class PerformanceMetricRequest(BaseModel):
    metricName: str
    durationMs: int
    screenName: Optional[str] = None
    userId: Optional[Any] = None
    timestamp: str
    additionalData: Optional[Dict[str, Any]] = None

class BLEErrorRequest(BaseModel):
    errorType: str
    errorMessage: str
    userId: Optional[Any] = None
    deviceInfo: DeviceInfo
    timestamp: str
    additionalData: Optional[Dict[str, Any]] = None

# ==================== ENDPOINTS ====================

@router.post("/log-error")
async def log_error(error_data: ErrorLogRequest):
    """
    Log a JavaScript error from the mobile app.
    This is a fire-and-forget endpoint - always returns 200 even if logging fails.
    """
    try:
        # Import here to avoid circular dependency
        from main import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        # Convert device info to JSON
        device_info_json = json.dumps(error_data.deviceInfo.dict())

        # Get additional data (everything not in the base model)
        additional_data = {k: v for k, v in error_data.dict().items()
                          if k not in ['message', 'stack', 'screenName', 'userId', 'deviceInfo', 'timestamp']}
        additional_data_json = json.dumps(additional_data) if additional_data else None

        cursor.execute("""
            INSERT INTO errors (timestamp, user_id, error_message, stack_trace, screen_name, device_info, additional_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            error_data.timestamp,
            error_data.userId,
            error_data.message,
            error_data.stack,
            error_data.screenName,
            device_info_json,
            additional_data_json
        ))

        conn.commit()
        cursor.close()
        conn.close()

        print(f"✅ Logged error from user {error_data.userId}: {error_data.message[:100]}")

    except Exception as e:
        # Don't let logging errors break the app - just log to console
        print(f"❌ Failed to log error to database: {e}")

    # Always return success - this is fire-and-forget
    return {"status": "logged"}

@router.post("/log-performance")
async def log_performance(metric_data: PerformanceMetricRequest):
    """
    Log a performance metric from the mobile app.
    This is a fire-and-forget endpoint - always returns 200 even if logging fails.
    """
    try:
        from main import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        additional_data_json = json.dumps(metric_data.additionalData) if metric_data.additionalData else None

        cursor.execute("""
            INSERT INTO performance_metrics (timestamp, user_id, metric_name, duration_ms, screen_name, additional_data)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            metric_data.timestamp,
            metric_data.userId,
            metric_data.metricName,
            metric_data.durationMs,
            metric_data.screenName,
            additional_data_json
        ))

        conn.commit()
        cursor.close()
        conn.close()

        # Warn if slow operation
        if metric_data.durationMs > 5000:
            print(f"⚠️  Slow operation: {metric_data.metricName} took {metric_data.durationMs}ms")

    except Exception as e:
        print(f"❌ Failed to log performance metric: {e}")

    return {"status": "logged"}

@router.post("/log-ble-error")
async def log_ble_error(ble_data: BLEErrorRequest):
    """
    Log a BLE-specific error from the mobile app.
    This is a fire-and-forget endpoint - always returns 200 even if logging fails.
    """
    try:
        from main import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        device_info_json = json.dumps(ble_data.deviceInfo.dict())
        additional_data_json = json.dumps(ble_data.additionalData) if ble_data.additionalData else None

        cursor.execute("""
            INSERT INTO ble_errors (timestamp, user_id, error_type, error_message, device_info, additional_data)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            ble_data.timestamp,
            ble_data.userId,
            ble_data.errorType,
            ble_data.errorMessage,
            device_info_json,
            additional_data_json
        ))

        conn.commit()
        cursor.close()
        conn.close()

        print(f"🔵 BLE Error [{ble_data.errorType}]: {ble_data.errorMessage}")

    except Exception as e:
        print(f"❌ Failed to log BLE error: {e}")

    return {"status": "logged"}

# ==================== QUERY ENDPOINTS (Optional) ====================

@router.get("/errors/recent")
async def get_recent_errors(limit: int = 50):
    """Get recent errors for monitoring dashboard."""
    try:
        from main import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, timestamp, user_id, error_message, screen_name, device_info
            FROM errors
            ORDER BY timestamp DESC
            LIMIT %s
        """, (limit,))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        errors = []
        for row in rows:
            errors.append({
                "id": row[0],
                "timestamp": row[1].isoformat() if row[1] else None,
                "user_id": row[2],
                "error_message": row[3],
                "screen_name": row[4],
                "device_info": row[5]
            })

        return {"errors": errors}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/performance/slow")
async def get_slow_operations(threshold_ms: int = 5000, limit: int = 50):
    """Get slow operations for performance monitoring."""
    try:
        from main import get_db_connection

        conn = get_db_connection()
        cursor = cursor()

        cursor.execute("""
            SELECT id, timestamp, user_id, metric_name, duration_ms, screen_name
            FROM performance_metrics
            WHERE duration_ms > %s
            ORDER BY duration_ms DESC
            LIMIT %s
        """, (threshold_ms, limit))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        metrics = []
        for row in rows:
            metrics.append({
                "id": row[0],
                "timestamp": row[1].isoformat() if row[1] else None,
                "user_id": row[2],
                "metric_name": row[3],
                "duration_ms": row[4],
                "screen_name": row[5]
            })

        return {"slow_operations": metrics}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ble-errors/summary")
async def get_ble_error_summary():
    """Get summary of BLE errors by type."""
    try:
        from main import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT error_type, COUNT(*) as count
            FROM ble_errors
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY error_type
            ORDER BY count DESC
        """)

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        summary = []
        for row in rows:
            summary.append({
                "error_type": row[0],
                "count": row[1]
            })

        return {"summary": summary}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== INTEGRATION INSTRUCTIONS ====================
"""
To integrate this into main.py:

1. Add this import at the top of main.py:
   from error_logging import router as error_logging_router

2. Include the router in your FastAPI app:
   app.include_router(error_logging_router)

3. Add the database table creation SQL to your startup event or migration:
   (See DATABASE SCHEMA section above)

4. That's it! The endpoints will be available at:
   - POST /api/log-error
   - POST /api/log-performance
   - POST /api/log-ble-error
   - GET /api/errors/recent
   - GET /api/performance/slow
   - GET /api/ble-errors/summary
"""
