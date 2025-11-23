import sys
sys.path.insert(0, 'backend')
import requests
import unittest.mock as mock

# Mock database to avoid connection errors
with mock.patch('main.init_db'):
    from main import create_access_token

print("=" * 60)
print("AUTH MIDDLEWARE VERIFICATION TEST")
print("=" * 60)

# Create valid token
token = create_access_token(user_id=1, username='test_verify')
print(f"\n✅ Generated test token: {token[:50]}...")
print(f"   Token segments: {len(token.split('.'))}")

base_url = "https://findable-production.up.railway.app"

# Test 1: Authorization Header
print("\n📋 TEST 1: Authorization Header")
try:
    response = requests.get(
        f"{base_url}/user/profile",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    print(f"   Status: {response.status_code}")
    print(f"   Result: {'✅ PASS' if response.status_code == 200 else '❌ FAIL'}")
    if response.status_code != 200:
        print(f"   Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ ERROR: {e}")

# Test 2: Cookie
print("\n📋 TEST 2: Cookie")
try:
    response = requests.get(
        f"{base_url}/user/profile",
        cookies={"token": token},
        timeout=10
    )
    print(f"   Status: {response.status_code}")
    print(f"   Result: {'✅ PASS' if response.status_code == 200 else '❌ FAIL'}")
    if response.status_code != 200:
        print(f"   Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ ERROR: {e}")

# Test 3: Query Parameter
print("\n📋 TEST 3: Query Parameter")
try:
    response = requests.get(
        f"{base_url}/user/profile?token={token}",
        timeout=10
    )
    print(f"   Status: {response.status_code}")
    print(f"   Result: {'✅ PASS' if response.status_code == 200 else '❌ FAIL'}")
    if response.status_code != 200:
        print(f"   Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ ERROR: {e}")

print("\n" + "=" * 60)
print("CONCLUSION:")
print("If ALL tests show 200 → Middleware works, frontend sends bad tokens")
print("If ALL tests show 401 → Middleware has a bug")
print("If SOME pass → Middleware works partially")
print("=" * 60)

