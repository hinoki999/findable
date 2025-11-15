"""
DropLink Backend API Tester
Tests all endpoints on production Railway backend
"""
import requests
import json
from datetime import datetime
import sys

# Configuration
BASE_URL = "https://findable-production.up.railway.app"
TEST_USER = "caitie690"
TEST_PASSWORD = "testpassword123"  # Update with actual test password

# Colors for console output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log(message, color=Colors.BLUE):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{color}[{timestamp}] {message}{Colors.END}")
    sys.stdout.flush()

def test_signup():
    """Test signup endpoint (create new user for testing)"""
    log("Testing POST /auth/signup...", Colors.YELLOW)
    try:
        # Use unique timestamp-based username for testing
        test_username = f"testuser_{int(datetime.now().timestamp())}"
        
        response = requests.post(f"{BASE_URL}/auth/signup", json={
            "username": test_username,
            "password": "TestPass123!",
            "email": f"{test_username}@test.com"
        })
        
        if response.status_code == 200:
            data = response.json()
            log(f"✅ Signup successful: user_id={data.get('user_id')}", Colors.GREEN)
            return data.get('token'), data.get('user_id')
        else:
            log(f"❌ Signup failed: {response.status_code} - {response.text}", Colors.RED)
            return None, None
    except Exception as e:
        log(f"❌ Signup error: {str(e)}", Colors.RED)
        return None, None

def test_login():
    """Test login endpoint and get auth token"""
    log("Testing POST /auth/login...", Colors.YELLOW)
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": TEST_USER,
            "password": TEST_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            user_id = data.get('user_id')
            log(f"✅ Login successful: user_id={user_id}", Colors.GREEN)
            return token, user_id
        else:
            log(f"❌ Login failed: {response.status_code} - {response.text}", Colors.RED)
            return None, None
    except Exception as e:
        log(f"❌ Login error: {str(e)}", Colors.RED)
        return None, None

def test_get_profile(token):
    """Test GET /user/profile - check hasCompletedOnboarding field"""
    log("Testing GET /user/profile...", Colors.YELLOW)
    try:
        response = requests.get(
            f"{BASE_URL}/user/profile",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            has_completed = data.get('hasCompletedOnboarding')
            log(f"✅ Profile retrieved: hasCompletedOnboarding={has_completed}", Colors.GREEN)
            return data
        else:
            log(f"❌ Get profile failed: {response.status_code} - {response.text}", Colors.RED)
            return None
    except Exception as e:
        log(f"❌ Get profile error: {str(e)}", Colors.RED)
        return None

def test_update_profile_onboarding(token, value=True):
    """Test POST /user/profile - update hasCompletedOnboarding"""
    log(f"Testing POST /user/profile (hasCompletedOnboarding={value})...", Colors.YELLOW)
    try:
        response = requests.post(
            f"{BASE_URL}/user/profile",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={"hasCompletedOnboarding": value}
        )
        
        if response.status_code == 200:
            log(f"✅ Profile updated: hasCompletedOnboarding set to {value}", Colors.GREEN)
            return True
        else:
            log(f"❌ Update failed: {response.status_code} - {response.text}", Colors.RED)
            return False
    except Exception as e:
        log(f"❌ Update error: {str(e)}", Colors.RED)
        return False

def test_profile_persistence(token):
    """Test that hasCompletedOnboarding persists across requests"""
    log("Testing profile persistence...", Colors.YELLOW)
    
    # Set to True
    if not test_update_profile_onboarding(token, True):
        log("❌ Could not set onboarding to True", Colors.RED)
        return False
    
    # Read back
    profile = test_get_profile(token)
    if not profile:
        log("❌ Could not read profile after update", Colors.RED)
        return False
    
    if profile.get('hasCompletedOnboarding') == True:
        log("✅ Persistence test PASSED: Value persisted correctly", Colors.GREEN)
        return True
    else:
        log(f"❌ Persistence test FAILED: Expected True, got {profile.get('hasCompletedOnboarding')}", Colors.RED)
        return False

def run_all_tests():
    """Run all backend tests"""
    log("=" * 60, Colors.BLUE)
    log("DROPLINK BACKEND API TESTS", Colors.BLUE)
    log("=" * 60, Colors.BLUE)
    
    # Test login
    token, user_id = test_login()
    if not token:
        log("⚠️  Login failed, trying signup...", Colors.YELLOW)
        token, user_id = test_signup()
        if not token:
            log("❌ Cannot proceed without authentication", Colors.RED)
            return
    
    # Test profile endpoints
    profile = test_get_profile(token)
    
    # Test updating onboarding status
    test_update_profile_onboarding(token, True)
    
    # Test persistence
    test_profile_persistence(token)
    
    log("=" * 60, Colors.BLUE)
    log("Backend tests complete!", Colors.BLUE)
    log("=" * 60, Colors.BLUE)

if __name__ == "__main__":
    try:
        run_all_tests()
    except KeyboardInterrupt:
        log("\n⚠️  Tests interrupted by user", Colors.YELLOW)
    except Exception as e:
        log(f"❌ Fatal error: {str(e)}", Colors.RED)

