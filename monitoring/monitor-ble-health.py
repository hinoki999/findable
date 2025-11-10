#!/usr/bin/env python3
"""
Monitor BLE errors from ble_errors table.
Identifies patterns in BLE failures across devices and platforms.
"""

import os
import sys
import time
import psycopg2
import json
from datetime import datetime, timedelta
from github import Github
from collections import defaultdict

# Configuration
DATABASE_URL = os.environ.get("DATABASE_URL", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "hinoki999/findable"
CHECK_INTERVAL = 180  # 3 minutes

# Track errors
last_check_time = None
recent_issues = set()
last_cleanup = time.time()

def create_github_issue(title, body, labels=["bug", "BLE", "automated"]):
    """Create a GitHub issue for BLE errors."""
    try:
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(GITHUB_REPO)

        # Check if similar issue already exists
        existing_issues = repo.get_issues(state="open", labels=labels)[:10]
        for issue in existing_issues:
            if title.lower() in issue.title.lower():
                print(f"⚠️  Similar issue already exists: {issue.html_url}")
                return issue.html_url

        # Create new issue
        issue = repo.create_issue(
            title=title,
            body=body,
            labels=labels
        )
        print(f"✅ Created GitHub issue: {issue.html_url}")
        return issue.html_url
    except Exception as e:
        print(f"❌ Failed to create GitHub issue: {e}")
        return None

def get_new_ble_errors(since_time):
    """Get BLE errors from database since last check."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        if since_time:
            cursor.execute("""
                SELECT id, timestamp, user_id, error_type, error_message, device_info, additional_data
                FROM ble_errors
                WHERE timestamp > %s
                ORDER BY timestamp DESC
            """, (since_time,))
        else:
            # First run - get last hour
            one_hour_ago = datetime.now() - timedelta(hours=1)
            cursor.execute("""
                SELECT id, timestamp, user_id, error_type, error_message, device_info, additional_data
                FROM ble_errors
                WHERE timestamp > %s
                ORDER BY timestamp DESC
            """, (one_hour_ago,))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        errors = []
        for row in rows:
            errors.append({
                "id": row[0],
                "timestamp": row[1],
                "user_id": row[2],
                "error_type": row[3],
                "error_message": row[4],
                "device_info": json.loads(row[5]) if row[5] else {},
                "additional_data": json.loads(row[6]) if row[6] else {}
            })

        return errors

    except Exception as e:
        print(f"❌ Failed to query ble_errors table: {e}")
        return []

def get_ble_error_summary():
    """Get summary of BLE errors over last 24 hours."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        one_day_ago = datetime.now() - timedelta(days=1)

        # Get counts by error type
        cursor.execute("""
            SELECT error_type, COUNT(*) as count
            FROM ble_errors
            WHERE timestamp > %s
            GROUP BY error_type
            ORDER BY count DESC
        """, (one_day_ago,))

        rows = cursor.fetchall()
        summary = {row[0]: row[1] for row in rows}

        cursor.close()
        conn.close()

        return summary

    except Exception as e:
        print(f"❌ Failed to get BLE error summary: {e}")
        return {}

def analyze_ble_errors(errors):
    """Analyze BLE errors and create GitHub issues."""
    global recent_issues

    if not errors:
        return

    print(f"\n🔵 Found {len(errors)} new BLE errors")

    # Group by error type
    errors_by_type = defaultdict(list)
    for error in errors:
        errors_by_type[error['error_type']].append(error)

    # Group by platform
    errors_by_platform = defaultdict(list)
    for error in errors:
        platform = error['device_info'].get('platform', 'Unknown')
        errors_by_platform[platform].append(error)

    # Group by device model
    errors_by_device = defaultdict(list)
    for error in errors:
        device = error['device_info'].get('deviceModel', 'Unknown')
        errors_by_device[device].append(error)

    # Alert on widespread BLE failures
    if len(errors) >= 5:
        issue_key = f"ble_widespread_{datetime.now().strftime('%Y%m%d%H')}"

        if issue_key not in recent_issues:
            recent_issues.add(issue_key)

            title = f"🔴 Widespread BLE Failures - {len(errors)} errors"
            body = f"""## Widespread BLE Failures Detected

**Total Errors:** {len(errors)}
**Time Period:** Last {CHECK_INTERVAL // 60} minutes

### Breakdown by Type
{chr(10).join([f"- **{error_type}**: {len(errs)} errors" for error_type, errs in errors_by_type.items()])}

### Breakdown by Platform
{chr(10).join([f"- **{platform}**: {len(errs)} errors" for platform, errs in errors_by_platform.items()])}

### Breakdown by Device
{chr(10).join([f"- **{device}**: {len(errs)} errors" for device, errs in list(errors_by_device.items())[:5]])}

### Common Errors
{chr(10).join([f"- {error['error_message'][:100]}" for error in errors[:5]])}

### Actions to Take
1. Check if BLE permissions are being requested properly
2. Test BLE initialization on affected platforms
3. Review BLE scanning logic in `src/services/ble.ts`
4. Check if specific devices/OS versions are affected
5. Consider fallback behavior for BLE failures

This issue was automatically created by the BLE monitoring system.
"""
            create_github_issue(title, body, ["critical", "BLE", "widespread"])

    # Alert on specific error type if recurring
    for error_type, errs in errors_by_type.items():
        if len(errs) >= 3:
            issue_key = f"ble_{error_type}_{datetime.now().strftime('%Y%m%d')}"

            if issue_key not in recent_issues:
                recent_issues.add(issue_key)

                first_error = errs[0]
                platforms = set(e['device_info'].get('platform', 'Unknown') for e in errs)

                title = f"🔵 Recurring BLE {error_type} Errors - {len(errs)} occurrences"
                body = f"""## Recurring BLE Error

**Error Type:** `{error_type}`
**Occurrences:** {len(errs)}
**Affected Platforms:** {', '.join(platforms)}

### First Error Message
```
{first_error['error_message']}
```

### Timestamp
{first_error['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}

### Device Info
- **Platform:** {first_error['device_info'].get('platform', 'Unknown')}
- **OS Version:** {first_error['device_info'].get('osVersion', 'Unknown')}
- **Device Model:** {first_error['device_info'].get('deviceModel', 'Unknown')}

### Affected Users
{', '.join([str(e['user_id']) for e in errs if e['user_id']][:10]) or 'Unknown'}

### Actions to Take
1. Check BLE {error_type} handling
2. Test on affected platforms: {', '.join(platforms)}
3. Review permissions and initialization flow
4. Add better error handling for this case

This issue was automatically created by the BLE monitoring system.
"""
                create_github_issue(title, body, ["BLE", error_type])

                print(f"\n🔵 Recurring BLE Error: {error_type}")
                print(f"   Count: {len(errs)}")
                print(f"   Platforms: {', '.join(platforms)}")

    # Alert on device-specific issues
    for device, errs in errors_by_device.items():
        if len(errs) >= 3 and device != 'Unknown':
            issue_key = f"ble_device_{device}_{datetime.now().strftime('%Y%m%d')}"

            if issue_key not in recent_issues:
                recent_issues.add(issue_key)

                error_types = set(e['error_type'] for e in errs)

                title = f"🔵 BLE Issues on {device}"
                body = f"""## Device-Specific BLE Issues

**Device:** {device}
**Occurrences:** {len(errs)}
**Error Types:** {', '.join(error_types)}

### Error Types Breakdown
{chr(10).join([f"- **{error_type}**: {len([e for e in errs if e['error_type'] == error_type])} errors" for error_type in error_types])}

### Sample Errors
{chr(10).join([f"- {e['error_message'][:100]}" for e in errs[:3]])}

### Actions to Take
1. Test BLE functionality on {device}
2. Check if specific to this device model
3. Review compatibility matrix
4. Consider device-specific workarounds

This issue was automatically created by the BLE monitoring system.
"""
                create_github_issue(title, body, ["BLE", "device-specific"])

                print(f"\n🔵 Device-Specific Issue: {device}")
                print(f"   Count: {len(errs)}")
                print(f"   Types: {', '.join(error_types)}")

def monitor_ble_health():
    """Main monitoring loop."""
    global last_check_time, recent_issues, last_cleanup

    print("🔍 Starting BLE error monitoring...")
    print(f"Check interval: {CHECK_INTERVAL} seconds\n")

    while True:
        try:
            current_time = time.time()

            # Clean up old issues every 12 hours
            if current_time - last_cleanup > 43200:
                recent_issues.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent issues cache")

            print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking BLE errors...")

            # Get new errors
            errors = get_new_ble_errors(last_check_time)

            # Get summary
            summary = get_ble_error_summary()

            if summary:
                print("\n📊 BLE Error Summary (last 24h):")
                for error_type, count in summary.items():
                    print(f"   - {error_type}: {count} errors")

            # Analyze errors
            if errors:
                analyze_ble_errors(errors)
            else:
                print("✅ No new BLE errors")

            # Update last check time
            last_check_time = datetime.now()

            # Sleep until next check
            time.sleep(CHECK_INTERVAL)

        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped by user")
            break
        except Exception as e:
            print(f"❌ Error in monitoring loop: {e}")
            time.sleep(CHECK_INTERVAL)

def main():
    """Main entry point."""
    print("=" * 60)
    print("🔵 BLE Error Monitor")
    print("=" * 60)
    print()

    # Check configuration
    if not DATABASE_URL:
        print("❌ DATABASE_URL environment variable not set")
        sys.exit(1)

    if not GITHUB_TOKEN:
        print("❌ GITHUB_TOKEN environment variable not set")
        sys.exit(1)

    print("✅ Configuration validated")
    print(f"✅ Monitoring repo: {GITHUB_REPO}")
    print()

    monitor_ble_health()

if __name__ == "__main__":
    main()
