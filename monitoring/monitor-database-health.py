#!/usr/bin/env python3
"""
Monitor PostgreSQL database health.
Checks connectivity and table integrity every 60 seconds.
"""

import os
import sys
import time
import psycopg2
from datetime import datetime
from github import Github

# Configuration
DATABASE_URL = os.environ.get("DATABASE_URL", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "hinoki999/findable"
CHECK_INTERVAL = 60  # seconds

# Track consecutive failures
consecutive_failures = 0
last_success = datetime.now()
recent_errors = set()
last_cleanup = time.time()

def create_github_issue(title, body, labels=["bug", "database", "automated"]):
    """Create a GitHub issue for the database error."""
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

def check_database_connection():
    """Test basic database connectivity."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.close()
        return True, None
    except Exception as e:
        return False, str(e)

def check_table_integrity():
    """Check that all required tables exist and are accessible."""
    required_tables = [
        "users",
        "user_profiles",
        "devices",
        "user_settings",
        "privacy_zones",
    ]

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        results = {}
        for table in required_tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table};")
                count = cursor.fetchone()[0]
                results[table] = {"status": "ok", "count": count}
            except Exception as e:
                results[table] = {"status": "error", "error": str(e)}

        cursor.close()
        conn.close()

        # Check if any table failed
        failed_tables = [t for t, r in results.items() if r["status"] == "error"]
        if failed_tables:
            return False, f"Failed tables: {', '.join(failed_tables)}", results
        else:
            return True, None, results

    except Exception as e:
        return False, str(e), {}

def check_database_size():
    """Check database size to detect unusual growth."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT pg_size_pretty(pg_database_size(current_database())) as size;
        """)
        size = cursor.fetchone()[0]

        cursor.close()
        conn.close()

        return True, size
    except Exception as e:
        return False, str(e)

def monitor_database():
    """Main monitoring loop."""
    global consecutive_failures, last_success, recent_errors, last_cleanup

    print("🔍 Starting database health monitoring...")
    print(f"Database: {DATABASE_URL[:30]}...")
    print(f"Check interval: {CHECK_INTERVAL} seconds\n")

    while True:
        try:
            current_time = time.time()

            # Clean up old errors every hour
            if current_time - last_cleanup > 3600:
                recent_errors.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent errors cache")

            print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Running health checks...")

            # 1. Check basic connectivity
            conn_ok, conn_error = check_database_connection()

            if not conn_ok:
                consecutive_failures += 1
                print(f"❌ Database connection failed: {conn_error}")
                print(f"   Consecutive failures: {consecutive_failures}")

                # Alert after 3 consecutive failures
                if consecutive_failures >= 3:
                    error_key = f"db_conn_{datetime.now().strftime('%Y%m%d%H')}"

                    if error_key not in recent_errors:
                        recent_errors.add(error_key)

                        title = f"🔴 Database Connection Failed - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                        body = f"""## Database Connection Failure

**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Consecutive Failures:** {consecutive_failures}
**Last Success:** {last_success.strftime('%Y-%m-%d %H:%M:%S')}
**Error:**
```
{conn_error}
```

**Actions to take:**
1. Check Railway dashboard for database status
2. Verify DATABASE_URL environment variable
3. Check if database is restarting
4. Check for connection limit issues
5. Verify network connectivity to Railway

This issue was automatically created by the database monitoring system.
"""
                        create_github_issue(title, body, ["critical", "database", "downtime"])

                time.sleep(CHECK_INTERVAL)
                continue

            print("✅ Database connection successful")

            # 2. Check table integrity
            tables_ok, tables_error, table_results = check_table_integrity()

            if not tables_ok:
                consecutive_failures += 1
                print(f"❌ Table integrity check failed: {tables_error}")

                error_key = f"db_tables_{datetime.now().strftime('%Y%m%d%H')}"

                if error_key not in recent_errors:
                    recent_errors.add(error_key)

                    table_details = "\n".join([
                        f"- **{table}**: {result}"
                        for table, result in table_results.items()
                    ])

                    title = f"🔴 Database Table Integrity Issue - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                    body = f"""## Database Table Integrity Problem

**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Error:** {tables_error}

**Table Status:**
{table_details}

**Actions to take:**
1. Check if migration failed
2. Verify schema in `backend/main.py`
3. Check Railway logs for SQL errors
4. Consider running database migration manually

This issue was automatically created by the database monitoring system.
"""
                    create_github_issue(title, body, ["critical", "database", "schema"])

                time.sleep(CHECK_INTERVAL)
                continue

            print("✅ All tables accessible")
            for table, result in table_results.items():
                print(f"   - {table}: {result['count']} rows")

            # 3. Check database size
            size_ok, size_info = check_database_size()

            if size_ok:
                print(f"✅ Database size: {size_info}")
            else:
                print(f"⚠️  Could not check database size: {size_info}")

            # All checks passed
            if consecutive_failures > 0:
                print(f"\n🎉 Database recovered after {consecutive_failures} failures!")
                consecutive_failures = 0

            last_success = datetime.now()

            # Sleep until next check
            time.sleep(CHECK_INTERVAL)

        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped by user")
            break
        except Exception as e:
            print(f"❌ Error in monitoring loop: {e}")
            consecutive_failures += 1
            time.sleep(CHECK_INTERVAL)

def main():
    """Main entry point."""
    print("=" * 60)
    print("🗄️  Database Health Monitor")
    print("=" * 60)
    print()

    # Check configuration
    if not DATABASE_URL:
        print("❌ DATABASE_URL environment variable not set")
        print("   Get from Railway dashboard")
        sys.exit(1)

    if not GITHUB_TOKEN:
        print("❌ GITHUB_TOKEN environment variable not set")
        print("   Set with: export GITHUB_TOKEN=your_token")
        sys.exit(1)

    print("✅ Configuration validated")
    print(f"✅ Monitoring repo: {GITHUB_REPO}")
    print()

    monitor_database()

if __name__ == "__main__":
    main()
