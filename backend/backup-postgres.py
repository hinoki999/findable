#!/usr/bin/env python3
"""
PostgreSQL Database Backup Script

Backs up Railway PostgreSQL database to Cloudinary with compression and timestamped filenames.
"""

import os
import sys
import subprocess
import gzip
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
DATABASE_URL = os.getenv("DATABASE_URL")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
BACKUP_FOLDER = "droplink/backups/postgres"


def calculate_checksum(file_path):
    """Calculate SHA-256 checksum of file"""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def check_pg_dump():
    """Check if pg_dump is available"""
    try:
        result = subprocess.run(
            ["pg_dump", "--version"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"✓ Found {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass
    
    print("Error: pg_dump not found")
    print("Install PostgreSQL client tools:")
    print("  Ubuntu/Debian: sudo apt-get install postgresql-client")
    print("  macOS: brew install postgresql")
    print("  Windows: Download from https://www.postgresql.org/download/windows/")
    return False


def backup_postgres():
    """Backup PostgreSQL database to Cloudinary"""
    
    # Validate environment variables
    if not DATABASE_URL:
        print("Error: DATABASE_URL not set in environment variables")
        sys.exit(1)
    
    if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
        print("Error: Cloudinary credentials not set in environment variables")
        print("Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET")
        sys.exit(1)
    
    # Check pg_dump availability
    if not check_pg_dump():
        sys.exit(1)
    
    # Configure Cloudinary
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    
    # Generate timestamped filename
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    backup_filename = f"droplink-postgres-backup-{timestamp}.sql"
    compressed_filename = f"{backup_filename}.gz"
    temp_backup_path = f"/tmp/{backup_filename}"
    temp_compressed_path = f"/tmp/{compressed_filename}"
    
    print(f"Starting PostgreSQL backup: {compressed_filename}")
    print(f"Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'Railway PostgreSQL'}")
    
    # Run pg_dump
    try:
        print("Running pg_dump...")
        with open(temp_backup_path, 'w') as f:
            result = subprocess.run(
                ["pg_dump", DATABASE_URL, "--no-owner", "--no-acl"],
                stdout=f,
                stderr=subprocess.PIPE,
                text=True
            )
        
        if result.returncode != 0:
            print(f"Error running pg_dump: {result.stderr}")
            if os.path.exists(temp_backup_path):
                os.remove(temp_backup_path)
            sys.exit(1)
        
        print(f"✓ Database exported successfully")
        
    except Exception as e:
        print(f"Error during pg_dump: {e}")
        if os.path.exists(temp_backup_path):
            os.remove(temp_backup_path)
        sys.exit(1)
    
    # Get uncompressed size
    uncompressed_size = os.path.getsize(temp_backup_path)
    uncompressed_size_mb = uncompressed_size / (1024 * 1024)
    print(f"✓ Uncompressed size: {uncompressed_size_mb:.2f} MB")
    
    # Compress with gzip
    try:
        print("Compressing backup...")
        with open(temp_backup_path, 'rb') as f_in:
            with gzip.open(temp_compressed_path, 'wb', compresslevel=9) as f_out:
                f_out.writelines(f_in)
        
        compressed_size = os.path.getsize(temp_compressed_path)
        compressed_size_mb = compressed_size / (1024 * 1024)
        compression_ratio = (1 - compressed_size / uncompressed_size) * 100
        
        print(f"✓ Compressed size: {compressed_size_mb:.2f} MB ({compression_ratio:.1f}% reduction)")
        
    except Exception as e:
        print(f"Error compressing backup: {e}")
        if os.path.exists(temp_backup_path):
            os.remove(temp_backup_path)
        if os.path.exists(temp_compressed_path):
            os.remove(temp_compressed_path)
        sys.exit(1)
    
    # Calculate checksum
    checksum = calculate_checksum(temp_compressed_path)
    print(f"✓ Checksum calculated: {checksum[:16]}...")
    
    # Upload to Cloudinary
    try:
        print("Uploading to Cloudinary...")
        result = cloudinary.uploader.upload(
            temp_compressed_path,
            resource_type="raw",
            public_id=f"{BACKUP_FOLDER}/daily/{compressed_filename}",
            tags=["postgres", "daily", "backup", timestamp[:8]],
            context=f"checksum={checksum}|compressed_size={compressed_size}|uncompressed_size={uncompressed_size}|timestamp={timestamp}"
        )
        
        print(f"✓ Upload successful!")
        print(f"  URL: {result['secure_url']}")
        print(f"  Public ID: {result['public_id']}")
        
    except Exception as e:
        print(f"Error uploading to Cloudinary: {e}")
        # Clean up temp files
        if os.path.exists(temp_backup_path):
            os.remove(temp_backup_path)
        if os.path.exists(temp_compressed_path):
            os.remove(temp_compressed_path)
        sys.exit(1)
    
    # Clean up temp files
    os.remove(temp_backup_path)
    os.remove(temp_compressed_path)
    print(f"✓ Temporary files cleaned up")
    
    print(f"\n✓ Backup completed successfully: {compressed_filename}")
    print(f"  Checksum: {checksum}")
    print(f"  Compressed: {compressed_size_mb:.2f} MB")
    print(f"  Uncompressed: {uncompressed_size_mb:.2f} MB")
    
    return {
        "filename": compressed_filename,
        "checksum": checksum,
        "compressed_size": compressed_size,
        "uncompressed_size": uncompressed_size,
        "url": result['secure_url'],
        "public_id": result['public_id']
    }


if __name__ == "__main__":
    try:
        backup_info = backup_postgres()
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\nBackup cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nBackup failed: {e}")
        sys.exit(1)


