#!/usr/bin/env python3
"""
Monitor critical API endpoints.
Tests endpoints every 2 minutes and alerts on errors or timeouts.
"""

import os
import sys
import time
import requests
import json
from datetime import datetime
from github import Github

# Configuration
BACKEND_URL = os.environ.get("BACKEND_URL", "https://findable-production.up.railway.app")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "hinoki999/findable"
CHECK_INTERVAL = 120  # 2 minutes
REQUEST_TIMEOUT = 30  # seconds

# Test credentials (create dedicated test account)
TEST_USERNAME = os.environ.get("TEST_USERNAME", "monitor_test_user")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "MonitorTest123!")
TEST_EMAIL = os.environ.get("TEST_EMAIL", "monitor@test.com")

# Track endpoint health
endpoint_failures = {}
recent_errors = set()
last_cleanup = time.time()
test_token = None

def create_github_issue(title, body, labels=["bug", "api", "automated"]):
    """Create a GitHub issue for the API error."""
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

def test_endpoint(method, path, data=None, headers=None, auth_required=False):
    """Test a single endpoint and return results."""
    url = f"{BACKEND_URL}{path}"
    start_time = time.time()

    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=REQUEST_TIMEOUT)
        else:
            raise ValueError(f"Unsupported method: {method}")

        duration = time.time() - start_time

        return {
            "success": response.status_code < 400 or (auth_required and response.status_code == 401),
            "status_code": response.status_code,
            "duration": duration,
            "response": response.text[:200] if response.text else None,
            "error": None
        }

    except requests.exceptions.Timeout:
        return {
            "success": False,
            "status_code": None,
            "duration": time.time() - start_time,
            "response": None,
            "error": "Request timeout"
        }
    except Exception as e:
        return {
            "success": False,
            "status_code": None,
            "duration": time.time() - start_time,
            "response": None,
            "error": str(e)
        }

def setup_test_account():
    """Create or login to test account to get auth token."""
    global test_token

    print("🔑 Setting up test account...")

    # Try to login first
    result = test_endpoint("POST", "/auth/login", data={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })

    if result["success"] and result["status_code"] == 200:
        try:
            response_data = json.loads(result["response"])
            test_token = response_data.get("token")
            if test_token:
                print("✅ Logged in with existing test account")
                return True
        except:
            pass

    # Try to register if login failed
    print("📝 Creating new test account...")
    result = test_endpoint("POST", "/auth/register", data={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD,
        "email": TEST_EMAIL
    })

    if result["success"]:
        try:
            response_data = json.loads(result["response"])
            test_token = response_data.get("token")
            if test_token:
                print("✅ Created and logged in with new test account")
                return True
        except:
            pass

    print("⚠️  Could not set up test account - some tests will be skipped")
    return False

def check_api_health():
    """Run health checks on all critical endpoints."""
    global endpoint_failures, test_token

    print(f"\n⏰ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Running API health checks...")

    results = {}

    # 1. Root endpoint
    print("\n1️⃣  Testing root endpoint...")
    result = test_endpoint("GET", "/")
    results["/"] = result
    if result["success"]:
        print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
    else:
        print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

    # 2. Login endpoint
    print("\n2️⃣  Testing login endpoint...")
    result = test_endpoint("POST", "/auth/login", data={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    results["/auth/login"] = result
    if result["success"]:
        print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
        # Update token
        try:
            response_data = json.loads(result["response"])
            test_token = response_data.get("token") or test_token
        except:
            pass
    else:
        print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

    # 3. Register endpoint (expect 400 if user exists)
    print("\n3️⃣  Testing register endpoint...")
    unique_username = f"test_{int(time.time())}"
    result = test_endpoint("POST", "/auth/register", data={
        "username": unique_username,
        "password": "Test123!",
        "email": f"{unique_username}@test.com"
    })
    results["/auth/register"] = result
    # Accept both 200 (created) and 400 (already exists)
    if result["success"] or result["status_code"] == 400:
        print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
    else:
        print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

    # If we have a token, test authenticated endpoints
    if test_token:
        headers = {"Authorization": f"Bearer {test_token}"}

        # 4. Get profile
        print("\n4️⃣  Testing get profile endpoint...")
        result = test_endpoint("GET", "/user/profile", headers=headers)
        results["/user/profile GET"] = result
        if result["success"]:
            print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
        else:
            print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

        # 5. Update profile
        print("\n5️⃣  Testing update profile endpoint...")
        result = test_endpoint("POST", "/user/profile", data={
            "name": "Monitor Test",
            "email": TEST_EMAIL,
            "phone": "1234567890",
            "bio": "Test account for monitoring"
        }, headers=headers)
        results["/user/profile POST"] = result
        if result["success"]:
            print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
        else:
            print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

        # 6. Get devices
        print("\n6️⃣  Testing get devices endpoint...")
        result = test_endpoint("GET", "/devices", headers=headers)
        results["/devices"] = result
        if result["success"]:
            print(f"   ✅ OK ({result['status_code']}) - {result['duration']:.2f}s")
        else:
            print(f"   ❌ FAILED - {result['error'] or result['status_code']}")

    else:
        print("\n⚠️  Skipping authenticated endpoint tests (no token)")

    # Analyze results and create issues
    analyze_results(results)

    return results

def analyze_results(results):
    """Analyze test results and create GitHub issues for failures."""
    global endpoint_failures, recent_errors

    for endpoint, result in results.items():
        if not result["success"]:
            # Track failures
            if endpoint not in endpoint_failures:
                endpoint_failures[endpoint] = 0
            endpoint_failures[endpoint] += 1

            # Alert after 3 consecutive failures
            if endpoint_failures[endpoint] >= 3:
                error_key = f"{endpoint}_{datetime.now().strftime('%Y%m%d%H')}"

                if error_key not in recent_errors:
                    recent_errors.add(error_key)

                    title = f"🔴 API Endpoint Failing: {endpoint}"
                    body = f"""## API Endpoint Failure

**Endpoint:** `{endpoint}`
**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Consecutive Failures:** {endpoint_failures[endpoint]}
**Status Code:** {result['status_code'] or 'N/A'}
**Duration:** {result['duration']:.2f}s
**Error:** {result['error'] or 'HTTP Error'}

**Response:**
```
{result['response'] or 'No response'}
```

**Actions to take:**
1. Check Railway logs for this endpoint
2. Test endpoint manually: `{BACKEND_URL}{endpoint.split()[0]}`
3. Check if database connection is working
4. Verify endpoint code in `backend/main.py`
5. Test locally to reproduce

This issue was automatically created by the API monitoring system.
"""
                    create_github_issue(title, body, ["critical", "api", "endpoint-failure"])

        else:
            # Success - reset failure counter
            if endpoint in endpoint_failures:
                if endpoint_failures[endpoint] > 0:
                    print(f"   🎉 {endpoint} recovered after {endpoint_failures[endpoint]} failures")
                endpoint_failures[endpoint] = 0

        # Alert on slow responses (>5 seconds)
        if result["duration"] > 5:
            error_key = f"{endpoint}_slow_{datetime.now().strftime('%Y%m%d%H')}"

            if error_key not in recent_errors:
                recent_errors.add(error_key)

                title = f"⚠️ Slow API Response: {endpoint}"
                body = f"""## Slow API Response Detected

**Endpoint:** `{endpoint}`
**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Duration:** {result['duration']:.2f}s (threshold: 5s)
**Status Code:** {result['status_code']}

**Actions to take:**
1. Check database query performance
2. Check if database is under load
3. Review endpoint logic for inefficiencies
4. Consider adding caching
5. Check Railway metrics for CPU/memory usage

This issue was automatically created by the API monitoring system.
"""
                create_github_issue(title, body, ["performance", "api", "slow-response"])

def monitor_api():
    """Main monitoring loop."""
    global recent_errors, last_cleanup

    print("🔍 Starting API health monitoring...")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Check interval: {CHECK_INTERVAL} seconds")
    print(f"Request timeout: {REQUEST_TIMEOUT} seconds\n")

    # Setup test account
    setup_test_account()

    while True:
        try:
            current_time = time.time()

            # Clean up old errors every hour
            if current_time - last_cleanup > 3600:
                recent_errors.clear()
                last_cleanup = current_time
                print("🧹 Cleared recent errors cache")

            # Run health checks
            check_api_health()

            # Sleep until next check
            print(f"\n💤 Sleeping for {CHECK_INTERVAL} seconds...")
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
    print("🌐 API Health Monitor")
    print("=" * 60)
    print()

    # Check configuration
    if not GITHUB_TOKEN:
        print("❌ GITHUB_TOKEN environment variable not set")
        print("   Set with: export GITHUB_TOKEN=your_token")
        sys.exit(1)

    print("✅ Configuration validated")
    print(f"✅ Monitoring repo: {GITHUB_REPO}")
    print(f"✅ Backend URL: {BACKEND_URL}")
    print()

    monitor_api()

if __name__ == "__main__":
    main()
