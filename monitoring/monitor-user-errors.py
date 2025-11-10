#!/usr/bin/env python3
"""
Monitor user-reported errors from the errors table.
Queries database every 60 seconds and creates GitHub issues for new crashes.
"""

import os
import sys
import time
import psycopg2
import json
from datetime import datetime, timedelta
from github import Github

# Configuration
DATABASE_URL = os.environ.get("DATABASE_URL", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "hinoki999/findable"
CHECK_INTERVAL = 60  # seconds

# Track last check time
last_check_time = None
recent_issues = set()
last_cleanup = time.time()

def create_github_issue(title, body, labels=["bug", "user-reported", "automated"]):
    """Create a GitHub issue for the error."""
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

def get_new_errors(since_time):
    """Get errors from database since last check."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        if since_time:
            cursor.execute("""
                SELECT id, timestamp, user_id, error_message, stack_trace, screen_name, device_info, additional_data
                FROM errors
                WHERE timestamp > %s
                ORDER BY timestamp DESC
            """, (since_time,))
        else:
            # First run - get last hour only
            one_hour_ago = datetime.now() - timedelta(hours=1)
            cursor.execute("""
                SELECT id, timestamp, user_id, error_message, stack_trace, screen_name, device_info, additional_data
                FROM errors
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
                "error_message": row[3],
                "stack_trace": row[4],
                "screen_name": row[5],
                "device_info": json.loads(row[6]) if row[6] else {},
                "additional_data": json.loads(row[7]) if row[7] else {}
            })

        return errors

    except Exception as e:
        print(f"❌ Failed to query errors table: {e}")
        return []

def analyze_errors(errors):
    """Analyze errors and create GitHub issues."""
    global recent_issues

    if not errors:
        return

    print(f"\n📊 Found {len(errors)} new errors")

    # Group errors by message to avoid duplicate issues
    error_groups = {}
    for error in errors:
        # Create a key based on error message and screen
        key = f"{error['error_message'][:100]}_{error['screen_name']}"

        if key not in error_groups:
            error_groups[key] = []
        error_groups[key].append(error)

    # Create issues for each error group
    for key, group in error_groups.items():
        count = len(group)
        first_error = group[0]

        # Check if we already created an issue for this error recently
        issue_key = f"{key}_{datetime.now().strftime('%Y%m%d%H')}"
        if issue_key in recent_issues:
            continue

        recent_issues.add(issue_key)

        # Get device info
        device_info = first_error['device_info']
        platform = device_info.get('platform', 'Unknown')
        os_version = device_info.get('osVersion', 'Unknown')
        device_model = device_info.get('deviceModel', 'Unknown')

        # Create issue
        title = f"🔴 User Error: {first_error['error_message'][:80]}"
        body = f"""## User-Reported Error

**Occurrences:** {count} time(s) in the last check
**Screen:** {first_error['screen_name'] or 'Unknown'}
**First Occurrence:** {first_error['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}

### Error Message
```
{first_error['error_message']}
```

### Stack Trace
```
{first_error['stack_trace'][:1000] if first_error['stack_trace'] else 'No stack trace available'}
```

### Device Info
- **Platform:** {platform}
- **OS Version:** {os_version}
- **Device Model:** {device_model}

### Affected Users
{', '.join([str(e['user_id']) for e in group if e['user_id']][:10]) or 'Unknown'}

### Actions to Take
1. Reproduce the error on the affected screen: `{first_error['screen_name']}`
2. Check the stack trace for the error location
3. Test on {platform} {os_version}
4. Fix the bug and deploy via EAS update

**Error ID:** {first_error['id']}

This issue was automatically created by the user error monitoring system.
"""
        create_github_issue(title, body, ["critical", "user-reported", "crash"])

        # Print to console
        print(f"\n🔴 New Error Group ({count} occurrences)")
        print(f"   Message: {first_error['error_message'][:100]}")
        print(f"   Screen: {first_error['screen_name']}")
        print(f"   Platform: {platform}")

def monitor_user_errors():
    """Main monitoring loop."""
    global last_check_time, recent_issues, last_cleanup

    print("🔍 Starting user error monitoring...")
    print(f"Check interval: {CHECK_INTERVAL} seconds\n")

    while True:
        try:
            current_time = time.time()

            # Clean up old issues every hour
            if current_time - last_cleanup > 3600:
                recent_issues.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent issues cache")

            print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking for new errors...")

            # Get new errors
            errors = get_new_errors(last_check_time)

            if errors:
                analyze_errors(errors)
            else:
                print("✅ No new errors")

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
    print("👤 User Error Monitor")
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

    monitor_user_errors()

if __name__ == "__main__":
    main()
