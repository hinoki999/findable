#!/usr/bin/env python3
"""
PostgreSQL Database Restoration Script

Restores PostgreSQL database from Cloudinary backup.
"""

import os
import sys
import subprocess
import gzip
import tempfile
from datetime import datetime

try:
    import cloudinary
    import cloudinary.api
except ImportError:
    print("Error: cloudinary package not installed")
    print("Run: pip install cloudinary")
    sys.exit(1)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")


def list_backups():
    """List all available PostgreSQL backups"""
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    
    try:
        resources = cloudinary.api.resources_by_tag(
            "postgres",
            resource_type="raw",
            max_results=100
        )
        
        backups = []
        for resource in resources.get('resources', []):
            filename = resource['public_id'].split('/')[-1]
            size_mb = resource['bytes'] / (1024 * 1024)
            created = datetime.fromisoformat(resource['created_at'].replace('Z', '+00:00'))
            
            backups.append({
                'id': resource['public_id'],
                'filename': filename,
                'size_mb': size_mb,
                'created': created,
                'url': resource['secure_url']
            })
        
        # Sort by creation date (newest first)
        backups.sort(key=lambda x: x['created'], reverse=True)
        
        print("\n" + "=" * 80)
        print("Available PostgreSQL Backups")
        print("=" * 80)
        
        for i, backup in enumerate(backups, 1):
            age = datetime.utcnow() - backup['created'].replace(tzinfo=None)
            age_str = f"{age.days}d {age.seconds // 3600}h ago" if age.days > 0 else f"{age.seconds // 3600}h ago"
            
            print(f"\n{i}. {backup['filename']}")
            print(f"   ID: {backup['id']}")
            print(f"   Size: {backup['size_mb']:.2f} MB")
            print(f"   Created: {backup['created'].strftime('%Y-%m-%d %H:%M:%S UTC')} ({age_str})")
        
        print("\n" + "=" * 80)
        return backups
        
    except Exception as e:
        print(f"Error listing backups: {e}")
        return []


def restore_backup(backup_id, confirm=True):
    """Restore database from backup"""
    
    # Validate environment variables
    if not DATABASE_URL:
        print("Error: DATABASE_URL not set")
        sys.exit(1)
    
    if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
        print("Error: Cloudinary credentials not set")
        sys.exit(1)
    
    # Configure Cloudinary
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    
    # Safety confirmation
    if confirm:
        print("\n" + "!" * 80)
        print("WARNING: This will REPLACE the current database with the backup!")
        print("!" * 80)
        print(f"\nBackup ID: {backup_id}")
        print(f"Target Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'Railway PostgreSQL'}")
        print("\nType 'RESTORE' (all caps) to confirm:")
        
        confirmation = input("> ")
        if confirmation != "RESTORE":
            print("Restoration cancelled")
            sys.exit(0)
    
    print("\nStarting restoration process...")
    
    # Download backup
    try:
        print("Downloading backup from Cloudinary...")
        resource = cloudinary.api.resource(backup_id, resource_type="raw")
        backup_url = resource['secure_url']
        
        # Download file
        import urllib.request
        temp_compressed = tempfile.NamedTemporaryFile(delete=False, suffix='.sql.gz')
        urllib.request.urlretrieve(backup_url, temp_compressed.name)
        temp_compressed.close()
        
        print(f"✓ Downloaded to {temp_compressed.name}")
        
    except Exception as e:
        print(f"Error downloading backup: {e}")
        sys.exit(1)
    
    # Decompress backup
    try:
        print("Decompressing backup...")
        temp_sql = tempfile.NamedTemporaryFile(delete=False, suffix='.sql', mode='wb')
        
        with gzip.open(temp_compressed.name, 'rb') as f_in:
            temp_sql.write(f_in.read())
        
        temp_sql.close()
        print(f"✓ Decompressed to {temp_sql.name}")
        
        # Clean up compressed file
        os.unlink(temp_compressed.name)
        
    except Exception as e:
        print(f"Error decompressing backup: {e}")
        if os.path.exists(temp_compressed.name):
            os.unlink(temp_compressed.name)
        sys.exit(1)
    
    # Restore database
    try:
        print("Restoring database...")
        print("This may take several minutes...")
        
        result = subprocess.run(
            ["psql", DATABASE_URL, "-f", temp_sql.name],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"Error restoring database: {result.stderr}")
            os.unlink(temp_sql.name)
            sys.exit(1)
        
        print("✓ Database restored successfully")
        
        # Clean up SQL file
        os.unlink(temp_sql.name)
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        if os.path.exists(temp_sql.name):
            os.unlink(temp_sql.name)
        sys.exit(1)
    
    print("\n✓ Restoration completed successfully!")
    print("\nNext steps:")
    print("1. Restart your Railway service")
    print("2. Test critical functionality")
    print("3. Monitor for issues")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Restore PostgreSQL database from backup")
    parser.add_argument("--list", action="store_true", help="List available backups")
    parser.add_argument("--backup-id", help="Backup public_id to restore")
    parser.add_argument("--latest", action="store_true", help="Restore latest backup")
    parser.add_argument("--no-confirm", action="store_true", help="Skip confirmation prompt")
    
    args = parser.parse_args()
    
    try:
        if args.list:
            backups = list_backups()
            sys.exit(0)
        
        elif args.latest:
            backups = list_backups()
            if not backups:
                print("No backups found")
                sys.exit(1)
            
            latest = backups[0]
            print(f"\nRestoring latest backup: {latest['filename']}")
            restore_backup(latest['id'], confirm=not args.no_confirm)
        
        elif args.backup_id:
            restore_backup(args.backup_id, confirm=not args.no_confirm)
        
        else:
            parser.print_help()
            sys.exit(1)
        
    except KeyboardInterrupt:
        print("\n\nRestoration cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nRestoration failed: {e}")
        sys.exit(1)


