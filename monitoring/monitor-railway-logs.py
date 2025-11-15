#!/usr/bin/env python3
"""
Monitor Railway logs for errors and create GitHub issues on detection.
Streams logs in real-time and alerts on 500 errors, exceptions, and crashes.
"""

import os
import sys
import time
import requests
import json
from datetime import datetime
from github import Github
import subprocess

# Configuration
RAILWAY_PROJECT_ID = os.environ.get("RAILWAY_PROJECT_ID", "")
RAILWAY_TOKEN = os.environ.get("RAILWAY_TOKEN", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "hinoki999/findable"
BACKEND_URL = "https://findable-production.up.railway.app"

# Error patterns to detect
ERROR_PATTERNS = [
    "500 Internal Server Error",
    "Exception",
    "Traceback",
    "ERROR",
    "CRITICAL",
    "Failed to",
    "could not",
    "Unable to",
    "crashed",
]

# Track recent errors to avoid duplicate issues
recent_errors = set()
last_cleanup = time.time()

def create_github_issue(title, body, labels=["bug", "backend", "automated"]):
    """Create a GitHub issue for the error."""
    try:
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(GITHUB_REPO)

        # Check if similar issue already exists (last 10 open issues)
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

def check_backend_health():
    """Quick health check of backend."""
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Backend health check failed: {e}")
        return False

def monitor_logs_via_requests():
    """
    Monitor Railway logs by periodically checking backend health
    and testing critical endpoints.
    Note: Railway doesn't provide a public streaming API,
    so we simulate by hitting endpoints and checking responses.
    """
    print("🔍 Starting Railway log monitoring...")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Will check every 60 seconds for errors\n")

    error_count = 0
    last_health_check = time.time()

    while True:
        try:
            current_time = time.time()

            # Clean up old errors every hour
            global last_cleanup, recent_errors
            if current_time - last_cleanup > 3600:
                recent_errors.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent errors cache")

            # Check backend health
            if current_time - last_health_check > 60:
                print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking backend health...")

                is_healthy = check_backend_health()

                if not is_healthy:
                    error_count += 1
                    error_key = f"backend_down_{datetime.now().strftime('%Y%m%d%H')}"

                    if error_key not in recent_errors:
                        recent_errors.add(error_key)
                        print("❌ BACKEND IS DOWN")

                        title = f"🔴 Backend Down - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                        body = f"""## Backend Health Check Failed

**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**URL:** {BACKEND_URL}
**Status:** Unreachable

The backend did not respond to health check requests.

**Actions to take:**
1. Check Railway dashboard for deployment status
2. Check Railway logs for crash information
3. Verify database connectivity
4. Check environment variables

**Error Count:** {error_count} consecutive failures
"""
                        create_github_issue(title, body, ["critical", "backend", "downtime"])
                else:
                    if error_count > 0:
                        print(f"✅ Backend is healthy again (was down for {error_count} checks)")
                        error_count = 0
                    else:
                        print("✅ Backend is healthy")

                last_health_check = current_time

            # Sleep for 60 seconds
            time.sleep(60)

        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped by user")
            break
        except Exception as e:
            print(f"❌ Error in monitoring loop: {e}")
            time.sleep(60)

def monitor_logs_via_cli():
    """
    Alternative: Monitor logs using Railway CLI if available.
    This requires Railway CLI to be installed and authenticated.
    """
    print("🔍 Attempting to stream Railway logs via CLI...")

    try:
        # Check if Railway CLI is installed
        result = subprocess.run(["railway", "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Railway CLI not installed. Using health check monitoring instead.")
            return False

        print(f"✅ Railway CLI found: {result.stdout.strip()}")
        print("📡 Streaming logs...\n")

        # Stream logs
        process = subprocess.Popen(
            ["railway", "logs", "--follow"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        for line in process.stdout:
            line = line.strip()
            if not line:
                continue

            print(line)

            # Check for error patterns
            for pattern in ERROR_PATTERNS:
                if pattern.lower() in line.lower():
                    error_key = f"{pattern}_{line[:50]}"

                    if error_key not in recent_errors:
                        recent_errors.add(error_key)

                        title = f"🔴 Backend Error Detected: {pattern}"
                        body = f"""## Error Detected in Railway Logs

**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Pattern:** {pattern}
**Log Line:**
```
{line}
```

**Actions to take:**
1. Check Railway dashboard for full logs
2. Investigate the error in `backend/main.py`
3. Test the failing endpoint locally
4. Deploy fix to develop branch

This issue was automatically created by the error monitoring system.
"""
                        create_github_issue(title, body)
                    break

        return True

    except FileNotFoundError:
        print("❌ Railway CLI not found. Using health check monitoring instead.")
        return False
    except Exception as e:
        print(f"❌ Error streaming Railway logs: {e}")
        return False

def main():
    """Main monitoring function."""
    print("=" * 60)
    print("🚂 Railway Log Monitor")
    print("=" * 60)
    print()

    # Check configuration
    if not GITHUB_TOKEN:
        print("❌ GITHUB_TOKEN environment variable not set")
        print("   Set with: export GITHUB_TOKEN=your_token")
        sys.exit(1)

    print("✅ GitHub token configured")
    print(f"✅ Monitoring repo: {GITHUB_REPO}")
    print(f"✅ Backend URL: {BACKEND_URL}")
    print()

    # Try CLI streaming first, fall back to health check monitoring
    if not monitor_logs_via_cli():
        print("\n" + "=" * 60)
        print("Falling back to health check monitoring")
        print("=" * 60 + "\n")
        monitor_logs_via_requests()

if __name__ == "__main__":
    main()
