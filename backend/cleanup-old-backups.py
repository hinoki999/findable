#!/usr/bin/env python3
"""
Backup Retention Policy Cleanup Script

Removes old backups according to retention policy:
- Daily: Keep 30 days
- Weekly: Keep 12 weeks (3 months)
- Monthly: Keep 12 months (1 year)
"""

import os
import sys
from datetime import datetime, timedelta

try:
    import cloudinary
    import cloudinary.api
except ImportError:
    print("Error: cloudinary package not installed")
    print("Run: pip install cloudinary")
    sys.exit(1)

# Configuration
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
BACKUP_FOLDER = "droplink/backups"

# Retention policy (in days)
DAILY_RETENTION = 30
WEEKLY_RETENTION = 84  # 12 weeks
MONTHLY_RETENTION = 365  # 12 months


def parse_timestamp_from_filename(filename):
    """Extract timestamp from backup filename"""
    try:
        # Format: droplink-postgres-backup-20251029-143022.sql.gz
        # Or: droplink-sqlite-backup-20251029-143022.db
        parts = filename.split('-')
        if len(parts) >= 5:
            date_str = parts[3]  # YYYYMMDD
            time_str = parts[4].split('.')[0]  # HHMMSS
            timestamp_str = f"{date_str}{time_str}"
            return datetime.strptime(timestamp_str, "%Y%m%d%H%M%S")
    except Exception:
        pass
    return None


def get_backups_by_type(backup_type="postgres"):
    """Get all backups of a specific type from Cloudinary"""
    try:
        resources = cloudinary.api.resources_by_tag(
            backup_type,
            resource_type="raw",
            max_results=500
        )
        
        backups = []
        for resource in resources.get('resources', []):
            filename = resource['public_id'].split('/')[-1]
            timestamp = parse_timestamp_from_filename(filename)
            
            if timestamp:
                backups.append({
                    'public_id': resource['public_id'],
                    'filename': filename,
                    'timestamp': timestamp,
                    'created_at': datetime.fromisoformat(resource['created_at'].replace('Z', '+00:00')),
                    'bytes': resource['bytes']
                })
        
        # Sort by timestamp (oldest first)
        backups.sort(key=lambda x: x['timestamp'])
        return backups
        
    except Exception as e:
        print(f"Error fetching backups: {e}")
        return []


def categorize_backups(backups):
    """Categorize backups into daily/weekly/monthly"""
    daily = []
    weekly = []
    monthly = []
    
    for backup in backups:
        timestamp = backup['timestamp']
        
        # Monthly: First backup of each month
        if timestamp.day == 1:
            monthly.append(backup)
        # Weekly: Sunday backups
        elif timestamp.weekday() == 6:  # Sunday
            weekly.append(backup)
        # Daily: All other backups
        else:
            daily.append(backup)
    
    return daily, weekly, monthly


def cleanup_backups(dry_run=False):
    """Remove old backups according to retention policy"""
    
    # Validate environment variables
    if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
        print("Error: Cloudinary credentials not set in environment variables")
        sys.exit(1)
    
    # Configure Cloudinary
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    
    now = datetime.utcnow()
    total_deleted = 0
    total_size_freed = 0
    
    print("=" * 60)
    print("Backup Cleanup - Retention Policy")
    print("=" * 60)
    print(f"Daily retention: {DAILY_RETENTION} days")
    print(f"Weekly retention: {WEEKLY_RETENTION} days ({WEEKLY_RETENTION // 7} weeks)")
    print(f"Monthly retention: {MONTHLY_RETENTION} days ({MONTHLY_RETENTION // 30} months)")
    print(f"Dry run: {dry_run}")
    print()
    
    # Process both PostgreSQL and SQLite backups
    for backup_type in ["postgres", "sqlite"]:
        print(f"\n{backup_type.upper()} Backups")
        print("-" * 60)
        
        backups = get_backups_by_type(backup_type)
        print(f"Found {len(backups)} total backups")
        
        if not backups:
            continue
        
        daily, weekly, monthly = categorize_backups(backups)
        print(f"  Daily: {len(daily)}")
        print(f"  Weekly: {len(weekly)}")
        print(f"  Monthly: {len(monthly)}")
        print()
        
        # Cleanup daily backups older than DAILY_RETENTION days
        daily_cutoff = now - timedelta(days=DAILY_RETENTION)
        daily_to_delete = [b for b in daily if b['timestamp'] < daily_cutoff]
        
        if daily_to_delete:
            print(f"Daily backups to delete: {len(daily_to_delete)}")
            for backup in daily_to_delete:
                age_days = (now - backup['timestamp']).days
                size_mb = backup['bytes'] / (1024 * 1024)
                print(f"  - {backup['filename']} (age: {age_days} days, size: {size_mb:.2f} MB)")
                
                if not dry_run:
                    try:
                        cloudinary.uploader.destroy(backup['public_id'], resource_type="raw")
                        total_deleted += 1
                        total_size_freed += backup['bytes']
                    except Exception as e:
                        print(f"    Error deleting: {e}")
        
        # Cleanup weekly backups older than WEEKLY_RETENTION days
        weekly_cutoff = now - timedelta(days=WEEKLY_RETENTION)
        weekly_to_delete = [b for b in weekly if b['timestamp'] < weekly_cutoff]
        
        if weekly_to_delete:
            print(f"Weekly backups to delete: {len(weekly_to_delete)}")
            for backup in weekly_to_delete:
                age_days = (now - backup['timestamp']).days
                size_mb = backup['bytes'] / (1024 * 1024)
                print(f"  - {backup['filename']} (age: {age_days} days, size: {size_mb:.2f} MB)")
                
                if not dry_run:
                    try:
                        cloudinary.uploader.destroy(backup['public_id'], resource_type="raw")
                        total_deleted += 1
                        total_size_freed += backup['bytes']
                    except Exception as e:
                        print(f"    Error deleting: {e}")
        
        # Cleanup monthly backups older than MONTHLY_RETENTION days
        monthly_cutoff = now - timedelta(days=MONTHLY_RETENTION)
        monthly_to_delete = [b for b in monthly if b['timestamp'] < monthly_cutoff]
        
        if monthly_to_delete:
            print(f"Monthly backups to delete: {len(monthly_to_delete)}")
            for backup in monthly_to_delete:
                age_days = (now - backup['timestamp']).days
                size_mb = backup['bytes'] / (1024 * 1024)
                print(f"  - {backup['filename']} (age: {age_days} days, size: {size_mb:.2f} MB)")
                
                if not dry_run:
                    try:
                        cloudinary.uploader.destroy(backup['public_id'], resource_type="raw")
                        total_deleted += 1
                        total_size_freed += backup['bytes']
                    except Exception as e:
                        print(f"    Error deleting: {e}")
    
    # Summary
    print()
    print("=" * 60)
    print("Cleanup Summary")
    print("=" * 60)
    if dry_run:
        print("DRY RUN - No backups were actually deleted")
    else:
        print(f"Deleted: {total_deleted} backups")
        print(f"Space freed: {total_size_freed / (1024 * 1024):.2f} MB")
    print()
    
    return total_deleted, total_size_freed


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Cleanup old database backups")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    args = parser.parse_args()
    
    try:
        deleted, size_freed = cleanup_backups(dry_run=args.dry_run)
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\nCleanup cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nCleanup failed: {e}")
        sys.exit(1)


