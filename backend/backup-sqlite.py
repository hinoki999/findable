#!/usr/bin/env python3
"""
SQLite Database Backup Script

Backs up local SQLite database to Cloudinary with timestamped filenames.
"""

import os
import sys
import shutil
import hashlib
from datetime import datetime
from pathlib import Path

try:
    import cloudinary
    import cloudinary.uploader
except ImportError:
    print("Error: cloudinary package not installed")
    print("Run: pip install cloudinary")
    sys.exit(1)

# Configuration
DB_PATH = os.getenv("SQLITE_DB_PATH", "./database.db")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
BACKUP_FOLDER = "droplink/backups/sqlite"


def calculate_checksum(file_path):
    """Calculate SHA-256 checksum of file"""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def backup_sqlite():
    """Backup SQLite database to Cloudinary"""
    
    # Validate environment variables
    if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
        print("Error: Cloudinary credentials not set in environment variables")
        print("Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET")
        sys.exit(1)
    
    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found: {DB_PATH}")
        sys.exit(1)
    
    # Configure Cloudinary
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    
    # Generate timestamped filename
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    backup_filename = f"droplink-sqlite-backup-{timestamp}.db"
    temp_backup_path = f"/tmp/{backup_filename}"
    
    print(f"Starting SQLite backup: {backup_filename}")
    print(f"Source: {DB_PATH}")
    
    # Copy database file
    try:
        shutil.copy2(DB_PATH, temp_backup_path)
        print(f"✓ Database copied to temporary location")
    except Exception as e:
        print(f"Error copying database: {e}")
        sys.exit(1)
    
    # Calculate checksum
    checksum = calculate_checksum(temp_backup_path)
    print(f"✓ Checksum calculated: {checksum[:16]}...")
    
    # Get file size
    file_size = os.path.getsize(temp_backup_path)
    file_size_mb = file_size / (1024 * 1024)
    print(f"✓ Backup size: {file_size_mb:.2f} MB")
    
    # Upload to Cloudinary
    try:
        print("Uploading to Cloudinary...")
        result = cloudinary.uploader.upload(
            temp_backup_path,
            resource_type="raw",
            public_id=f"{BACKUP_FOLDER}/daily/{backup_filename}",
            tags=["sqlite", "daily", "backup", timestamp[:8]],
            context=f"checksum={checksum}|size={file_size}|timestamp={timestamp}"
        )
        
        print(f"✓ Upload successful!")
        print(f"  URL: {result['secure_url']}")
        print(f"  Public ID: {result['public_id']}")
        
    except Exception as e:
        print(f"Error uploading to Cloudinary: {e}")
        # Clean up temp file
        if os.path.exists(temp_backup_path):
            os.remove(temp_backup_path)
        sys.exit(1)
    
    # Clean up temp file
    os.remove(temp_backup_path)
    print(f"✓ Temporary file cleaned up")
    
    print(f"\n✓ Backup completed successfully: {backup_filename}")
    print(f"  Checksum: {checksum}")
    print(f"  Size: {file_size_mb:.2f} MB")
    
    return {
        "filename": backup_filename,
        "checksum": checksum,
        "size": file_size,
        "url": result['secure_url'],
        "public_id": result['public_id']
    }


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Backup SQLite database to Cloudinary")
    parser.add_argument("--db-path", help="Path to SQLite database file", default=DB_PATH)
    args = parser.parse_args()
    
    DB_PATH = args.db_path
    
    try:
        backup_info = backup_sqlite()
        sys.exit(0)
    except Exception as e:
        print(f"\nBackup failed: {e}")
        sys.exit(1)


