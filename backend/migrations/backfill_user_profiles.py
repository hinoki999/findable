"""
Backfill user_profiles rows for existing users who don't have them.
This fixes users created before the registration fix was deployed.
"""
import os
import sys

# Add parent directory to path to import from main.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import get_db_connection, get_cursor, execute_query, USE_POSTGRES

def backfill_user_profiles():
    """Create user_profiles rows for users who don't have them"""
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn)
        
        print("🔍 Finding users without user_profiles rows...")
        
        # Find all users who don't have a user_profiles row
        execute_query(cursor, '''
            SELECT u.id, u.email 
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE up.user_id IS NULL
        ''')
        
        missing_users = cursor.fetchall()
        
        if not missing_users:
            print("✅ All users already have user_profiles rows!")
            conn.close()
            return
        
        print(f"📊 Found {len(missing_users)} users without profiles")
        
        # Create user_profiles row for each missing user
        for user in missing_users:
            if USE_POSTGRES:
                user_id = user['id']
                email = user['email']
            else:
                user_id = user[0]
                email = user[1]
            
            print(f"  Creating profile for user_id={user_id}, email={email}")
            
            execute_query(cursor, '''
                INSERT INTO user_profiles (user_id, email, has_completed_onboarding)
                VALUES (?, ?, ?)
            ''', (user_id, email, 0))
        
        conn.commit()
        conn.close()
        
        print(f"✅ Successfully backfilled {len(missing_users)} user_profiles rows!")
        
    except Exception as e:
        print(f"❌ Error during backfill: {e}")
        raise

if __name__ == '__main__':
    print("🚀 Starting user_profiles backfill...")
    backfill_user_profiles()
    print("🎉 Backfill complete!")

