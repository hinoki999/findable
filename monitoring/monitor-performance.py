#!/usr/bin/env python3
"""
Monitor performance metrics from performance_metrics table.
Alerts on slow operations and tracks performance trends.
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
CHECK_INTERVAL = 300  # 5 minutes
SLOW_THRESHOLD = 5000  # 5 seconds in ms

# Track metrics
last_check_time = None
recent_issues = set()
last_cleanup = time.time()
performance_trends = defaultdict(list)

def create_github_issue(title, body, labels=["performance", "automated"]):
    """Create a GitHub issue for performance problems."""
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

def get_slow_operations(since_time, threshold_ms):
    """Get slow operations from database."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        if since_time:
            cursor.execute("""
                SELECT id, timestamp, user_id, metric_name, duration_ms, screen_name, additional_data
                FROM performance_metrics
                WHERE timestamp > %s AND duration_ms > %s
                ORDER BY duration_ms DESC
            """, (since_time, threshold_ms))
        else:
            # First run - get last hour
            one_hour_ago = datetime.now() - timedelta(hours=1)
            cursor.execute("""
                SELECT id, timestamp, user_id, metric_name, duration_ms, screen_name, additional_data
                FROM performance_metrics
                WHERE timestamp > %s AND duration_ms > %s
                ORDER BY duration_ms DESC
            """, (one_hour_ago, threshold_ms))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        metrics = []
        for row in rows:
            metrics.append({
                "id": row[0],
                "timestamp": row[1],
                "user_id": row[2],
                "metric_name": row[3],
                "duration_ms": row[4],
                "screen_name": row[5],
                "additional_data": json.loads(row[6]) if row[6] else {}
            })

        return metrics

    except Exception as e:
        print(f"❌ Failed to query performance_metrics table: {e}")
        return []

def get_metric_averages():
    """Get average duration for each metric over the last 24 hours."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        one_day_ago = datetime.now() - timedelta(days=1)
        cursor.execute("""
            SELECT metric_name, AVG(duration_ms) as avg_duration, COUNT(*) as count, MAX(duration_ms) as max_duration
            FROM performance_metrics
            WHERE timestamp > %s
            GROUP BY metric_name
            ORDER BY avg_duration DESC
        """, (one_day_ago,))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        averages = []
        for row in rows:
            averages.append({
                "metric_name": row[0],
                "avg_duration": row[1],
                "count": row[2],
                "max_duration": row[3]
            })

        return averages

    except Exception as e:
        print(f"❌ Failed to get metric averages: {e}")
        return []

def analyze_performance(slow_operations, averages):
    """Analyze performance data and create GitHub issues."""
    global recent_issues, performance_trends

    # Report slow operations
    if slow_operations:
        print(f"\n🐌 Found {len(slow_operations)} slow operations")

        # Group by metric name
        slow_by_metric = defaultdict(list)
        for op in slow_operations:
            slow_by_metric[op['metric_name']].append(op)

        # Create issues for consistently slow operations
        for metric_name, ops in slow_by_metric.items():
            if len(ops) >= 3:  # Only alert if 3+ slow operations
                issue_key = f"{metric_name}_slow_{datetime.now().strftime('%Y%m%d')}"

                if issue_key not in recent_issues:
                    recent_issues.add(issue_key)

                    slowest = max(ops, key=lambda x: x['duration_ms'])
                    avg_duration = sum(op['duration_ms'] for op in ops) / len(ops)

                    title = f"⚠️ Slow Operation: {metric_name}"
                    body = f"""## Slow Operation Detected

**Metric:** `{metric_name}`
**Occurrences:** {len(ops)} slow operations
**Average Duration:** {avg_duration:.0f}ms
**Slowest:** {slowest['duration_ms']}ms
**Threshold:** {SLOW_THRESHOLD}ms

### Slowest Example
- **Screen:** {slowest['screen_name']}
- **Duration:** {slowest['duration_ms']}ms
- **Timestamp:** {slowest['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}
- **User:** {slowest['user_id']}

### Actions to Take
1. Profile the operation: `{metric_name}`
2. Check database query performance if applicable
3. Review code for inefficiencies
4. Consider caching or optimization
5. Test on different devices/connections

This issue was automatically created by the performance monitoring system.
"""
                    create_github_issue(title, body, ["performance", "slow-operation"])

                    print(f"\n🐌 Slow Metric: {metric_name}")
                    print(f"   Count: {len(ops)}")
                    print(f"   Avg Duration: {avg_duration:.0f}ms")

    # Report performance trends
    if averages:
        print(f"\n📊 Performance Averages (last 24h):")
        for avg in averages[:10]:
            metric_name = avg['metric_name']
            avg_duration = avg['avg_duration']
            count = avg['count']

            print(f"   - {metric_name}: {avg_duration:.0f}ms avg ({count} samples)")

            # Track trends
            performance_trends[metric_name].append({
                "timestamp": datetime.now(),
                "avg_duration": avg_duration
            })

            # Keep only last 12 data points (1 hour with 5-min intervals)
            performance_trends[metric_name] = performance_trends[metric_name][-12:]

            # Check for degrading performance
            if len(performance_trends[metric_name]) >= 6:
                recent_avg = sum(p['avg_duration'] for p in performance_trends[metric_name][-3:]) / 3
                older_avg = sum(p['avg_duration'] for p in performance_trends[metric_name][-6:-3]) / 3

                # If performance degraded by >50%
                if recent_avg > older_avg * 1.5:
                    issue_key = f"{metric_name}_degrading_{datetime.now().strftime('%Y%m%d')}"

                    if issue_key not in recent_issues:
                        recent_issues.add(issue_key)

                        title = f"📉 Performance Degradation: {metric_name}"
                        body = f"""## Performance Degradation Detected

**Metric:** `{metric_name}`
**Recent Average:** {recent_avg:.0f}ms
**Previous Average:** {older_avg:.0f}ms
**Degradation:** {((recent_avg / older_avg - 1) * 100):.0f}%

### Trend
Performance has gotten {((recent_avg / older_avg - 1) * 100):.0f}% slower over the last hour.

### Actions to Take
1. Check if there are database issues
2. Review recent code changes
3. Check Railway metrics for resource usage
4. Investigate if data size has grown
5. Consider if this is due to increased load

This issue was automatically created by the performance monitoring system.
"""
                        create_github_issue(title, body, ["performance", "degradation"])

                        print(f"\n📉 Performance Degrading: {metric_name}")
                        print(f"   Was: {older_avg:.0f}ms")
                        print(f"   Now: {recent_avg:.0f}ms")

def monitor_performance():
    """Main monitoring loop."""
    global last_check_time, recent_issues, last_cleanup

    print("🔍 Starting performance monitoring...")
    print(f"Check interval: {CHECK_INTERVAL} seconds")
    print(f"Slow threshold: {SLOW_THRESHOLD}ms\n")

    while True:
        try:
            current_time = time.time()

            # Clean up old issues every day
            if current_time - last_cleanup > 86400:
                recent_issues.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent issues cache")

            print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking performance metrics...")

            # Get slow operations
            slow_operations = get_slow_operations(last_check_time, SLOW_THRESHOLD)

            # Get metric averages
            averages = get_metric_averages()

            # Analyze
            analyze_performance(slow_operations, averages)

            if not slow_operations and not averages:
                print("✅ No performance data available")

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
    print("📊 Performance Monitor")
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

    monitor_performance()

if __name__ == "__main__":
    main()
