# scripts/fix_production_once.py
import psycopg2
import os

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cursor = conn.cursor()

# Check what columns actually exist
cursor.execute("""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'user_profiles'
""")

columns = [row[0] for row in cursor.fetchall()]
print(f"Current columns in user_profiles: {columns}")

# Only add if missing
if 'has_completed_onboarding' not in columns:
    cursor.execute("""
        ALTER TABLE user_profiles 
        ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT FALSE
    """)
    print("✅ Added has_completed_onboarding column")
else:
    print("✅ Column already exists")

conn.commit()
conn.close()
