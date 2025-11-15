"""
DropLink Sign-Up Flow Tester
Tests when accounts are created in the signup process
"""
import os
import psycopg2
import requests
import json
from datetime import datetime, timedelta
import sys
import time

# Configuration
DATABASE_URL = os.environ.get('DATABASE_URL', '')
BASE_URL = "https://findable-production.up.railway.app"
TEST_EMAIL = "signup.flow.test@example.com"

# Colors for console output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'

def log(message, color=Colors.BLUE):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] {message}{Colors.END}")
    sys.stdout.flush()

def separator():
    print(f"{Colors.CYAN}{'='*80}{Colors.END}")

# ============= DATABASE CHECKS =============

def connect_db():
    """Connect to Railway PostgreSQL database"""
    try:
        if not DATABASE_URL:
            log("❌ DATABASE_URL not set", Colors.RED)
            log("Set it via: $env:DATABASE_URL='your_database_url'", Colors.YELLOW)
            return None
        
        log("Connecting to database...", Colors.YELLOW)
        conn = psycopg2.connect(DATABASE_URL)
        log("✅ Database connected", Colors.GREEN)
        return conn
    except Exception as e:
        log(f"❌ Database connection failed: {str(e)}", Colors.RED)
        return None

def check_recent_users(conn):
    """Check users created in the last hour"""
    try:
        cursor = conn.cursor()
        one_hour_ago = datetime.now() - timedelta(hours=1)
        
        log("\n📊 CHECKING USERS CREATED IN LAST HOUR", Colors.CYAN)
        separator()
        
        cursor.execute("""
            SELECT u.id, u.username, u.email, u.created_at, 
                   up.phone, up.has_completed_onboarding
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.created_at > %s
            ORDER BY u.created_at DESC
        """, (one_hour_ago,))
        
        users = cursor.fetchall()
        
        if not users:
            log("No users created in the last hour", Colors.YELLOW)
            return
        
        log(f"Found {len(users)} user(s) created in the last hour:", Colors.GREEN)
        print()
        
        for user in users:
            user_id, username, email, created_at, phone, onboarding = user
            log(f"  User ID: {user_id}", Colors.BLUE)
            log(f"  Username: {username}", Colors.BLUE)
            log(f"  Email: {email or 'None'}", Colors.BLUE)
            log(f"  Created: {created_at}", Colors.BLUE)
            log(f"  Phone: {phone or 'None'}", Colors.BLUE)
            onboarding_status = "✅ Completed" if onboarding else "❌ Not completed"
            log(f"  Onboarding: {onboarding_status}", Colors.GREEN if onboarding else Colors.YELLOW)
            print()
        
    except Exception as e:
        log(f"❌ Error checking recent users: {str(e)}", Colors.RED)

def check_user_exists(conn, username=None, email=None):
    """Check if a user exists in database"""
    try:
        cursor = conn.cursor()
        
        if username:
            cursor.execute("SELECT id, username, email FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
        elif email:
            cursor.execute("SELECT id, username, email FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        else:
            return None
        
        user = cursor.fetchone()
        if user:
            return {"id": user[0], "username": user[1], "email": user[2]}
        return None
    except Exception as e:
        log(f"❌ Error checking user: {str(e)}", Colors.RED)
        return None

# ============= API TESTS =============

def test_send_verification_code(email):
    """Test sending verification code"""
    log(f"\n🔸 STEP 1: Send verification code to {email}", Colors.CYAN)
    try:
        response = requests.post(f"{BASE_URL}/auth/send-verification-code", json={
            "email": email
        })
        
        if response.status_code == 200:
            data = response.json()
            log(f"✅ Code sent successfully", Colors.GREEN)
            log(f"Response: {data.get('message')}", Colors.BLUE)
            return True
        else:
            log(f"❌ Failed to send code: {response.status_code}", Colors.RED)
            log(f"Error: {response.text}", Colors.RED)
            return False
    except Exception as e:
        log(f"❌ Error: {str(e)}", Colors.RED)
        return False

def get_verification_code_from_db(conn, email):
    """Get the verification code from database (for testing)"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT code, expires_at 
            FROM verification_codes 
            WHERE email = %s AND code_type = 'registration'
            ORDER BY created_at DESC 
            LIMIT 1
        """, (email.lower(),))
        
        result = cursor.fetchone()
        if result:
            code, expires_at = result
            log(f"📧 Retrieved code from database: {code}", Colors.YELLOW)
            return code
        return None
    except Exception as e:
        log(f"❌ Error getting code from DB: {str(e)}", Colors.RED)
        return None

def test_verify_code(email, code):
    """Test verifying the code"""
    log(f"\n🔸 STEP 2: Verify code {code}", Colors.CYAN)
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-code", json={
            "email": email,
            "code": code
        })
        
        if response.status_code == 200:
            data = response.json()
            log(f"✅ Code verified successfully", Colors.GREEN)
            log(f"Response: {data.get('message')}", Colors.BLUE)
            return True
        else:
            log(f"❌ Failed to verify code: {response.status_code}", Colors.RED)
            log(f"Error: {response.text}", Colors.RED)
            return False
    except Exception as e:
        log(f"❌ Error: {str(e)}", Colors.RED)
        return False

def test_register(username, password, email):
    """Test account registration"""
    log(f"\n🔸 STEP 3: Register account with username '{username}'", Colors.CYAN)
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "username": username,
            "password": password,
            "email": email
        })
        
        if response.status_code == 200:
            data = response.json()
            log(f"✅ Account registered successfully", Colors.GREEN)
            log(f"User ID: {data.get('user_id')}", Colors.BLUE)
            log(f"Username: {data.get('username')}", Colors.BLUE)
            return data.get('token'), data.get('user_id')
        else:
            log(f"❌ Registration failed: {response.status_code}", Colors.RED)
            log(f"Error: {response.text}", Colors.RED)
            return None, None
    except Exception as e:
        log(f"❌ Error: {str(e)}", Colors.RED)
        return None, None

# ============= MAIN TEST =============

def main():
    print(f"\n{Colors.CYAN}╔{'═'*78}╗{Colors.END}")
    print(f"{Colors.CYAN}║{' '*20}DROPLINK SIGN-UP FLOW TESTER{' '*30}║{Colors.END}")
    print(f"{Colors.CYAN}╚{'═'*78}╝{Colors.END}\n")
    
    # Connect to database
    conn = connect_db()
    if not conn:
        log("Cannot proceed without database connection", Colors.RED)
        return
    
    # Part 1: Check recent users
    check_recent_users(conn)
    
    # Part 2: Test sign-up flow
    separator()
    log("\n🧪 TESTING SIGN-UP FLOW", Colors.CYAN)
    separator()
    
    test_username = f"flowtest_{int(time.time())}"
    test_password = "TestPass123!@#"
    
    log(f"\nTest credentials:", Colors.BLUE)
    log(f"  Username: {test_username}", Colors.BLUE)
    log(f"  Email: {TEST_EMAIL}", Colors.BLUE)
    log(f"  Password: {test_password}", Colors.BLUE)
    print()
    
    # Check 1: Before sending code
    separator()
    log("CHECK 1: User exists BEFORE sending verification code?", Colors.YELLOW)
    user = check_user_exists(conn, username=test_username)
    if user:
        log(f"❌ FAIL: User already exists! {user}", Colors.RED)
    else:
        log(f"✅ PASS: User does not exist yet", Colors.GREEN)
    
    # Step 1: Send verification code
    separator()
    if not test_send_verification_code(TEST_EMAIL):
        log("Test aborted: Failed to send verification code", Colors.RED)
        return
    
    # Check 2: After sending code
    separator()
    log("CHECK 2: User exists AFTER sending verification code?", Colors.YELLOW)
    user = check_user_exists(conn, username=test_username)
    if user:
        log(f"❌ FAIL: User created prematurely! {user}", Colors.RED)
        log("🐛 BUG: Account created when code was sent (TOO EARLY)", Colors.RED)
    else:
        log(f"✅ PASS: User still does not exist", Colors.GREEN)
    
    # Get verification code from database
    code = get_verification_code_from_db(conn, TEST_EMAIL)
    if not code:
        log("Test aborted: Could not retrieve verification code", Colors.RED)
        return
    
    # Step 2: Verify code
    separator()
    if not test_verify_code(TEST_EMAIL, code):
        log("Test aborted: Failed to verify code", Colors.RED)
        return
    
    # Check 3: After verifying code
    separator()
    log("CHECK 3: User exists AFTER verifying code?", Colors.YELLOW)
    user = check_user_exists(conn, username=test_username)
    if user:
        log(f"❌ FAIL: User created prematurely! {user}", Colors.RED)
        log("🐛 BUG: Account created when code was verified (TOO EARLY)", Colors.RED)
    else:
        log(f"✅ PASS: User still does not exist", Colors.GREEN)
    
    # Step 3: Register account
    separator()
    token, user_id = test_register(test_username, test_password, TEST_EMAIL)
    if not token:
        log("Test aborted: Registration failed", Colors.RED)
        return
    
    # Check 4: After registration
    separator()
    log("CHECK 4: User exists AFTER registration?", Colors.YELLOW)
    user = check_user_exists(conn, username=test_username)
    if user:
        log(f"✅ PASS: User created successfully! {user}", Colors.GREEN)
    else:
        log(f"❌ FAIL: User was not created!", Colors.RED)
        log("🐛 BUG: Registration succeeded but no user record!", Colors.RED)
    
    # Check 5: Onboarding status
    separator()
    log("CHECK 5: Onboarding status for new user?", Colors.YELLOW)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT has_completed_onboarding 
            FROM user_profiles 
            WHERE user_id = %s
        """, (user_id,))
        result = cursor.fetchone()
        
        if result:
            onboarding = result[0]
            if onboarding:
                log(f"❌ FAIL: hasCompletedOnboarding = {onboarding} (should be False/0)", Colors.RED)
                log("🐛 BUG: Tutorial will not show for new users!", Colors.RED)
            else:
                log(f"✅ PASS: hasCompletedOnboarding = {onboarding} (False/0)", Colors.GREEN)
                log("Tutorial WILL show for this new user", Colors.GREEN)
        else:
            log("⚠️ No profile record found (may not have saved profile yet)", Colors.YELLOW)
    except Exception as e:
        log(f"❌ Error checking onboarding: {str(e)}", Colors.RED)
    
    # Final summary
    separator()
    print(f"\n{Colors.CYAN}╔{'═'*78}╗{Colors.END}")
    print(f"{Colors.CYAN}║{' '*30}TEST COMPLETE{' '*36}║{Colors.END}")
    print(f"{Colors.CYAN}╚{'═'*78}╝{Colors.END}\n")
    
    log("✅ Sign-up flow test completed", Colors.GREEN)
    log(f"Test user created: {test_username} (ID: {user_id})", Colors.BLUE)
    
    conn.close()

if __name__ == "__main__":
    main()

