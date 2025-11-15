"""
Wipe all user data from Railway PostgreSQL database
This deletes all testing accounts but keeps the database structure intact
"""
import psycopg2
import os

def wipe_user_data():
    """Delete all user data from production database"""
    
    # Connect to Railway database
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        print("❌ ERROR: DATABASE_URL not found in environment")
        return
    
    print("🔌 Connecting to Railway database...")
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    try:
        print("🗑️  Deleting user data...")
        
        # Delete in correct order to respect foreign key constraints
        cursor.execute("DELETE FROM user_profiles")
        profiles_deleted = cursor.rowcount
        print(f"   ✅ Deleted {profiles_deleted} user profiles")
        
        cursor.execute("DELETE FROM devices")
        devices_deleted = cursor.rowcount
        print(f"   ✅ Deleted {devices_deleted} devices")
        
        cursor.execute("DELETE FROM verification_codes")
        codes_deleted = cursor.rowcount
        print(f"   ✅ Deleted {codes_deleted} verification codes")
        
        cursor.execute("DELETE FROM users")
        users_deleted = cursor.rowcount
        print(f"   ✅ Deleted {users_deleted} users")
        
        # Commit the changes
        conn.commit()
        
        print("\n✅ ALL USER DATA WIPED SUCCESSFULLY!")
        print(f"\nSummary:")
        print(f"  - Users: {users_deleted}")
        print(f"  - Profiles: {profiles_deleted}")
        print(f"  - Devices: {devices_deleted}")
        print(f"  - Verification codes: {codes_deleted}")
        print("\n🎯 Database is now clean - ready for fresh testing!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: {e}")
        print("Rolling back changes...")
    finally:
        cursor.close()
        conn.close()
        print("\n🔌 Database connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("⚠️  WARNING: This will DELETE ALL user data!")
    print("=" * 60)
    wipe_user_data()
