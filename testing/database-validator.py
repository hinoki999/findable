"""
DropLink Database Validator
Directly queries Railway PostgreSQL to validate data persistence
"""
import os
import psycopg2
from datetime import datetime
import sys

# Configuration
DATABASE_URL = os.environ.get('DATABASE_URL', '')  # Set via Railway CLI or env var
TEST_USER = "caitie690"

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

def connect_db():
    """Connect to Railway PostgreSQL database"""
    try:
        if not DATABASE_URL:
            log("❌ DATABASE_URL not set. Set it via: $env:DATABASE_URL='postgresql://...'", Colors.RED)
            return None
        
        log("Connecting to Railway PostgreSQL...", Colors.YELLOW)
        conn = psycopg2.connect(DATABASE_URL)
        log("✅ Database connection established", Colors.GREEN)
        return conn
    except Exception as e:
        log(f"❌ Database connection failed: {str(e)}", Colors.RED)
        return None

def get_user_profile(conn, username):
    """Query user profile from database"""
    try:
        cursor = conn.cursor()
        
        # First get user_id
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
        if not user:
            log(f"❌ User '{username}' not found in database", Colors.RED)
            return None
        
        user_id = user[0]
        log(f"✅ Found user_id: {user_id}", Colors.GREEN)
        
        # Get profile data
        cursor.execute("""
            SELECT user_id, name, email, phone, bio, has_completed_onboarding
            FROM user_profiles
            WHERE user_id = %s
        """, (user_id,))
        
        profile = cursor.fetchone()
        
        if profile:
            log(f"✅ Profile found:", Colors.GREEN)
            log(f"   - user_id: {profile[0]}", Colors.BLUE)
            log(f"   - name: {profile[1]}", Colors.BLUE)
            log(f"   - email: {profile[2]}", Colors.BLUE)
            log(f"   - phone: {profile[3]}", Colors.BLUE)
            log(f"   - bio: {profile[4]}", Colors.BLUE)
            log(f"   - has_completed_onboarding: {profile[5]}", Colors.GREEN if profile[5] else Colors.YELLOW)
            return profile
        else:
            log(f"⚠️  No profile found for user_id {user_id}", Colors.YELLOW)
            return None
            
    except Exception as e:
        log(f"❌ Query error: {str(e)}", Colors.RED)
        return None

def check_onboarding_status(conn, username):
    """Check if has_completed_onboarding is set correctly"""
    log(f"Checking onboarding status for '{username}'...", Colors.YELLOW)
    
    profile = get_user_profile(conn, username)
    
    if not profile:
        log("❌ Cannot validate - profile not found", Colors.RED)
        return False
    
    has_completed = profile[5]  # has_completed_onboarding column
    
    if has_completed == True or has_completed == 1:
        log("✅ VALIDATION PASSED: Onboarding marked as complete", Colors.GREEN)
        return True
    else:
        log(f"⚠️  VALIDATION WARNING: Onboarding status is {has_completed}", Colors.YELLOW)
        return False

def monitor_onboarding_changes(conn, username, interval=60):
    """Monitor database for changes in onboarding status"""
    log(f"Monitoring onboarding status every {interval}s (Ctrl+C to stop)...", Colors.BLUE)
    
    previous_status = None
    
    while True:
        try:
            profile = get_user_profile(conn, username)
            if profile:
                current_status = profile[5]
                
                if previous_status is not None and current_status != previous_status:
                    log(f"🔔 CHANGE DETECTED: {previous_status} → {current_status}", Colors.YELLOW)
                
                previous_status = current_status
            
            import time
            time.sleep(interval)
            
        except KeyboardInterrupt:
            log("\n⚠️  Monitoring stopped by user", Colors.YELLOW)
            break
        except Exception as e:
            log(f"❌ Monitoring error: {str(e)}", Colors.RED)
            import time
            time.sleep(interval)

def run_validation():
    """Run database validation tests"""
    log("=" * 60, Colors.BLUE)
    log("DROPLINK DATABASE VALIDATION", Colors.BLUE)
    log("=" * 60, Colors.BLUE)
    
    conn = connect_db()
    if not conn:
        log("❌ Cannot proceed without database connection", Colors.RED)
        log("💡 Tip: Get DATABASE_URL from Railway dashboard and set it:", Colors.YELLOW)
        log("   PowerShell: $env:DATABASE_URL='postgresql://...'", Colors.YELLOW)
        return
    
    try:
        # Check onboarding status
        check_onboarding_status(conn, TEST_USER)
        
        log("=" * 60, Colors.BLUE)
        log("Database validation complete!", Colors.BLUE)
        log("=" * 60, Colors.BLUE)
        
    finally:
        conn.close()
        log("✅ Database connection closed", Colors.GREEN)

if __name__ == "__main__":
    try:
        run_validation()
    except KeyboardInterrupt:
        log("\n⚠️  Validation interrupted by user", Colors.YELLOW)
    except Exception as e:
        log(f"❌ Fatal error: {str(e)}", Colors.RED)

