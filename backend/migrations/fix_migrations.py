import psycopg2
import os
from datetime import datetime

def safe_add_column(cursor, table, column, definition):
    """Add column only if it doesn't exist"""
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = %s AND column_name = %s
    """, (table, column))
    
    if not cursor.fetchone():
        print(f"✅ Adding {column} to {table}")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    else:
        print(f"⏭️  Column {column} already exists in {table}")

def fix_production_database():
    """Fix all migration issues in production"""
    
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cursor = conn.cursor()
    
    print("🔧 Fixing database migrations...")
    
    # Fix users table
    safe_add_column(cursor, 'users', 'failed_login_attempts', 'INTEGER DEFAULT 0')
    safe_add_column(cursor, 'users', 'locked_until', 'TEXT')
    safe_add_column(cursor, 'users', 'key_version', 'INTEGER DEFAULT 1')
    
    # Fix user_profiles table
    safe_add_column(cursor, 'user_profiles', 'has_completed_onboarding', 'INTEGER DEFAULT 0')
    
    conn.commit()
    print("✅ Database migrations fixed!")
    
    # Verify current schema
    cursor.execute("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name, ordinal_position
    """)
    
    print("\n📊 Current Database Schema:")
    current_table = None
    for row in cursor.fetchall():
        if row[0] != current_table:
            current_table = row[0]
            print(f"\n{current_table}:")
        print(f"  - {row[1]} ({row[2]})")
    
    conn.close()

if __name__ == "__main__":
    fix_production_database()

