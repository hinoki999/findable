#!/usr/bin/env python3
"""
Monitor API Call Logs
Detects missing or failed API calls from mobile app
"""

import os
import psycopg2
from datetime import datetime, timedelta
from github import Github

DATABASE_URL = os.environ.get('DATABASE_URL')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
REPO_NAME = "hinoki999/findable"

def create_github_issue(title, body):
    """Create a GitHub issue for detected problems"""
    try:
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(REPO_NAME)

        # Check if issue already exists
        existing_issues = repo.get_issues(state='open', labels=['api-monitoring'])
        for issue in existing_issues:
            if title in issue.title:
                print(f"ℹ️  Issue already exists: {issue.html_url}")
                return

        # Create new issue
        issue = repo.create_issue(
            title=title,
            body=body,
            labels=['api-monitoring', 'bug']
        )
        print(f"✅ Created GitHub issue: {issue.html_url}")
    except Exception as e:
        print(f"❌ Failed to create GitHub issue: {e}")

def check_failed_api_calls():
    """Detect failed API calls"""
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Check for failed calls in last 10 minutes
    cursor.execute("""
        SELECT endpoint, method, COUNT(*) as failure_count,
               array_agg(DISTINCT user_id) as affected_users,
               array_agg(DISTINCT error) as errors
        FROM api_call_logs
        WHERE timestamp > NOW() - INTERVAL '10 minutes'
          AND success = false
        GROUP BY endpoint, method
        HAVING COUNT(*) >= 3
        ORDER BY failure_count DESC
    """)

    failed_calls = cursor.fetchall()

    for endpoint, method, count, users, errors in failed_calls:
        title = f"🔴 API Failures: {method} {endpoint} ({count} failures)"
        body = f"""## API Call Failures Detected

**Endpoint:** `{method} {endpoint}`
**Failures:** {count} in last 10 minutes
**Affected Users:** {len([u for u in users if u])} users
**User IDs:** {', '.join([str(u) for u in users if u]) or 'Anonymous'}

**Error Messages:**
{chr(10).join([f"- {e}" for e in set(errors) if e])}

**Possible Causes:**
- Backend endpoint failing
- Network connectivity issues
- Invalid request data from mobile app
- Authentication problems

**Action Required:**
1. Check backend logs on Railway
2. Test the endpoint manually
3. Verify mobile app is sending correct data
"""
        create_github_issue(title, body)

    if not failed_calls:
        print("✅ No unusual API failures detected")

    conn.close()

def check_missing_api_calls():
    """Detect when expected API calls are missing"""
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Pattern 1: Users viewing profile but never saving
    # Expected: After GET /user/profile, should see POST /user/profile when editing

    cursor.execute("""
        WITH recent_profile_activity AS (
            SELECT DISTINCT
                user_id,
                endpoint,
                method,
                timestamp
            FROM api_call_logs
            WHERE timestamp > NOW() - INTERVAL '30 minutes'
              AND endpoint LIKE '%/user/profile'
              AND user_id IS NOT NULL
        ),
        viewers AS (
            SELECT DISTINCT user_id
            FROM recent_profile_activity
            WHERE method = 'GET'
        ),
        savers AS (
            SELECT DISTINCT user_id
            FROM recent_profile_activity
            WHERE method = 'POST'
        )
        SELECT v.user_id
        FROM viewers v
        LEFT JOIN savers s ON v.user_id = s.user_id
        WHERE s.user_id IS NULL
          AND EXISTS (
              -- Only flag if they made multiple GET requests (actively using)
              SELECT 1 FROM recent_profile_activity
              WHERE user_id = v.user_id AND method = 'GET'
              GROUP BY user_id
              HAVING COUNT(*) >= 3
          )
    """)

    users_viewing_not_saving = cursor.fetchall()

    if users_viewing_not_saving and len(users_viewing_not_saving) >= 3:
        user_ids = [str(u[0]) for u in users_viewing_not_saving]
        title = f"⚠️ Missing API Calls: {len(user_ids)} users viewing profile but not saving"
        body = f"""## Missing POST /user/profile Calls

**Pattern Detected:** Users are fetching their profile multiple times but never saving updates.

**Affected Users:** {len(user_ids)} users
**User IDs:** {', '.join(user_ids)}

**Expected Flow:**
1. User opens Account screen → GET /user/profile ✓
2. User edits profile field → (local state update) ✓
3. User saves → **POST /user/profile ✗ MISSING**

**Possible Causes:**
- AccountScreen `updateProfile()` not calling API
- UI save button not connected to save handler
- Silent error preventing API call
- User abandoning edit before saving (legitimate)

**Action Required:**
1. Check AccountScreen.tsx `updateProfile()` function
2. Verify save button calls `updateProfile()`
3. Check mobile app console for errors
4. Test profile editing flow manually

**Note:** This could also be users viewing their profile without editing. Monitor for increasing trend.
"""
        create_github_issue(title, body)

    # Pattern 2: Signup flow incomplete
    # Expected: POST /auth/register → POST /user/profile within 2 minutes

    cursor.execute("""
        WITH recent_signups AS (
            SELECT user_id, timestamp
            FROM api_call_logs
            WHERE timestamp > NOW() - INTERVAL '15 minutes'
              AND endpoint LIKE '%/auth/register'
              AND method = 'POST'
              AND success = true
        ),
        profile_saves AS (
            SELECT DISTINCT user_id
            FROM api_call_logs
            WHERE timestamp > NOW() - INTERVAL '15 minutes'
              AND endpoint LIKE '%/user/profile'
              AND method = 'POST'
        )
        SELECT s.user_id
        FROM recent_signups s
        LEFT JOIN profile_saves p ON s.user_id = p.user_id
        WHERE p.user_id IS NULL
    """)

    incomplete_signups = cursor.fetchall()

    if incomplete_signups and len(incomplete_signups) >= 2:
        user_ids = [str(u[0]) for u in incomplete_signups]
        title = f"⚠️ Incomplete Signups: {len(user_ids)} users registered but profile not saved"
        body = f"""## Incomplete Signup Flow

**Pattern Detected:** Users completed registration but profile data was never saved to backend.

**Affected Users:** {len(user_ids)} new users
**User IDs:** {', '.join(user_ids)}

**Expected Flow:**
1. User fills signup form ✓
2. POST /auth/register succeeds ✓
3. POST /user/profile with form data ✗ **MISSING**

**Possible Causes:**
- SignupScreen not calling `saveUserProfile()` after registration
- Race condition preventing profile save
- Network timeout after registration
- Silent error in signup success handler

**Action Required:**
1. Check SignupScreen.tsx `handleSignupSuccess()` function
2. Verify profile data is being sent to backend
3. Check for race conditions in signup flow
4. Test signup flow end-to-end

**Impact:** **HIGH** - New users losing their profile data on signup
"""
        create_github_issue(title, body)

    conn.close()

def check_api_call_trends():
    """Check for unusual patterns in API calls"""
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Check if specific endpoints are being called unusually frequently
    cursor.execute("""
        SELECT
            endpoint,
            method,
            COUNT(*) as call_count,
            COUNT(DISTINCT user_id) as unique_users
        FROM api_call_logs
        WHERE timestamp > NOW() - INTERVAL '10 minutes'
        GROUP BY endpoint, method
        HAVING COUNT(*) > 100  -- More than 100 calls in 10 minutes
        ORDER BY call_count DESC
    """)

    high_frequency_calls = cursor.fetchall()

    for endpoint, method, count, users in high_frequency_calls:
        if users and count / users > 20:  # More than 20 calls per user
            title = f"⚠️ Unusual API Call Frequency: {method} {endpoint}"
            body = f"""## High Frequency API Calls

**Endpoint:** `{method} {endpoint}`
**Call Count:** {count} calls in 10 minutes
**Unique Users:** {users} users
**Avg per User:** {count / users:.1f} calls/user

**This may indicate:**
- Polling loop not respecting rate limits
- UI triggering API calls on every render
- Retry logic stuck in loop
- Legitimate high usage

**Action Required:**
1. Review mobile app code for this endpoint
2. Check if calls are in a loop
3. Verify proper debouncing/throttling
4. Monitor server load
"""
            create_github_issue(title, body)

    conn.close()

if __name__ == "__main__":
    print("🔍 Monitoring API call logs...")

    try:
        check_failed_api_calls()
        check_missing_api_calls()
        check_api_call_trends()

        print("✅ API call monitoring complete")
    except Exception as e:
        print(f"❌ Monitoring failed: {e}")
        raise
