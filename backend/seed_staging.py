#!/usr/bin/env python3
"""
Seed staging database with test data
Run this after deploying to staging to create test users and data
"""

import requests
import sys
from datetime import datetime

STAGING_URL = "https://droplink-staging.up.railway.app"

def seed_test_users():
    """Create test users in staging environment"""
    users = [
        {
            "username": "testuser1",
            "password": "Test1234!",
            "email": "testuser1@example.com"
        },
        {
            "username": "testuser2",
            "password": "Test1234!",
            "email": "testuser2@example.com"
        },
        {
            "username": "testuser3",
            "password": "Test1234!",
            "email": "testuser3@example.com"
        },
        {
            "username": "admin_test",
            "password": "Admin1234!",
            "email": "admin@example.com"
        },
    ]
    
    print("🌱 Seeding test users...")
    print("")
    
    created_users = []
    
    for user in users:
        try:
            response = requests.post(
                f"{STAGING_URL}/auth/register",
                json=user,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ Created user: {user['username']}")
                created_users.append({
                    "username": user['username'],
                    "password": user['password'],
                    "token": data.get('token')
                })
            else:
                print(f"✗ Failed to create {user['username']}: {response.status_code}")
                print(f"  Response: {response.text}")
        except Exception as e:
            print(f"✗ Error creating {user['username']}: {e}")
    
    print("")
    print(f"Created {len(created_users)} / {len(users)} test users")
    print("")
    
    return created_users

def seed_test_data(users):
    """Create test data for users"""
    if not users:
        print("⚠️  No users available for seeding data")
        return
    
    print("🌱 Seeding test data...")
    print("")
    
    # Create test profile for first user
    user = users[0]
    headers = {"Authorization": f"Bearer {user['token']}"}
    
    try:
        # Update profile
        profile_data = {
            "name": "Test User One",
            "email": "testuser1@example.com",
            "phone": "(555) 123-4567",
            "bio": "This is a test user account for staging environment testing."
        }
        
        response = requests.post(
            f"{STAGING_URL}/user/profile",
            json=profile_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✓ Created profile for {user['username']}")
        else:
            print(f"✗ Failed to create profile: {response.status_code}")
    except Exception as e:
        print(f"✗ Error creating profile: {e}")
    
    # Create test privacy zone
    try:
        zone_data = {
            "address": "123 Test Street, Test City, TS 12345",
            "radius": 500,
            "latitude": 37.7749,
            "longitude": -122.4194
        }
        
        response = requests.post(
            f"{STAGING_URL}/user/privacy-zones",
            json=zone_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✓ Created privacy zone for {user['username']}")
        else:
            print(f"✗ Failed to create privacy zone: {response.status_code}")
    except Exception as e:
        print(f"✗ Error creating privacy zone: {e}")
    
    print("")

def test_staging_health():
    """Test staging environment health"""
    print("🏥 Testing staging health...")
    print("")
    
    try:
        response = requests.get(f"{STAGING_URL}/health", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Staging is healthy")
            print(f"  Status: {data.get('status')}")
            print(f"  Database: {data.get('database')}")
            print(f"  Environment: {data.get('environment')}")
            print("")
            return True
        else:
            print(f"✗ Staging health check failed: {response.status_code}")
            print("")
            return False
    except Exception as e:
        print(f"✗ Cannot reach staging: {e}")
        print("")
        return False

def main():
    print("=" * 50)
    print("Staging Environment Seeding")
    print("=" * 50)
    print(f"Target: {STAGING_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)
    print("")
    
    # Test health first
    if not test_staging_health():
        print("⚠️  Staging environment not ready. Exiting.")
        sys.exit(1)
    
    # Seed users
    users = seed_test_users()
    
    # Seed additional data
    if users:
        seed_test_data(users)
    
    # Summary
    print("=" * 50)
    print("Seeding Complete!")
    print("=" * 50)
    print("")
    print("Test Users Created:")
    for user in users:
        print(f"  • {user['username']} / Test1234!")
    print("")
    print("You can now test the staging environment with these accounts.")
    print("")

if __name__ == "__main__":
    main()


