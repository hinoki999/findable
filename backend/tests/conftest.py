"""
Pytest configuration and shared fixtures for DropLink tests
"""

import pytest
import requests
import os
import psycopg2
from typing import Dict, Any

# Base URL for API tests
BASE_URL = os.getenv('TEST_BACKEND_URL', 'http://localhost:8000')


@pytest.fixture(scope="session")
def test_user_credentials() -> Dict[str, str]:
    """
    Provides standard test user credentials
    
    Returns:
        dict: {'username': email, 'password': password}
    """
    return {
        'username': os.getenv('TEST_USER_USERNAME', 'test_droplink'),
        'password': os.getenv('TEST_USER_PASSWORD', 'TestPass123!')
    }


@pytest.fixture(scope="session")
def auth_token(test_user_credentials: Dict[str, str]) -> str:
    """
    Get auth token with detailed debugging
    
    Args:
        test_user_credentials: From test_user_credentials fixture
        
    Returns:
        str: JWT authentication token
    """
    # Log what we're trying
    print(f"\n🔐 Attempting login with: {test_user_credentials['username']}")
    print(f"📍 Backend URL: {BASE_URL}")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json=test_user_credentials
    )
    
    # Detailed failure reporting
    if response.status_code != 200:
        print(f"❌ Auth failed: {response.status_code}")
        print(f"📋 Response body: {response.text}")
        print(f"🔑 Headers: {response.headers}")
        
        # Check common issues
        if response.status_code == 404:
            print("⚠️  Endpoint not found - check backend is running")
        elif response.status_code == 401:
            print("⚠️  Invalid credentials - check test user exists")
        elif response.status_code == 500:
            print("⚠️  Server error - check backend logs")
    
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    token = response.json().get("token")
    assert token, "No token in response"
    
    print(f"✅ Auth successful - Token: {token[:20]}...")
    return token


@pytest.fixture(scope="session")
def test_database():
    """
    Provides test database connection
    
    Yields:
        psycopg2.connection: Database connection for tests
    """
    db_url = os.getenv('TEST_DATABASE_URL')
    assert db_url, "TEST_DATABASE_URL not set"
    
    conn = psycopg2.connect(db_url)
    
    yield conn
    
    # Cleanup after all tests
    conn.close()


@pytest.fixture
def api_client(auth_token: str) -> requests.Session:
    """
    Pre-configured requests session with authentication
    
    Args:
        auth_token: From auth_token fixture
        
    Returns:
        requests.Session: Session with auth headers set
    """
    session = requests.Session()
    session.headers.update({
        'Authorization': f'Bearer {auth_token}',
        'Content-Type': 'application/json'
    })
    return session


@pytest.fixture
def db_cursor(test_database):
    """
    Provides database cursor for queries
    
    Args:
        test_database: From test_database fixture
        
    Yields:
        psycopg2.cursor: Database cursor
    """
    cursor = test_database.cursor()
    yield cursor
    cursor.close()


def pytest_configure(config):
    """
    Pytest hook - runs before all tests
    Validates environment is ready
    """
    print("\n" + "="*50)
    print("DROPLINK TEST SUITE - CONFIGURATION")
    print("="*50)
    
    # Check critical env vars
    required_vars = [
        'TEST_DATABASE_URL',
        'TEST_USER_EMAIL',
        'TEST_USER_PASSWORD',
        'TEST_BACKEND_URL'
    ]
    
    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    if missing:
        print(f"\n❌ Missing environment variables:")
        for var in missing:
            print(f"   • {var}")
        print(f"\n💡 Run: python scripts/setup-test-environment.py")
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    
    print(f"\n✅ Environment validated")
    print(f"📍 Backend: {os.getenv('TEST_BACKEND_URL')}")
    print(f"🗄️  Database: {os.getenv('TEST_DATABASE_URL')[:50]}...")
    print(f"👤 Test user: {os.getenv('TEST_USER_EMAIL')}")
    print("="*50 + "\n")


def pytest_sessionfinish(session, exitstatus):
    """
    Pytest hook - runs after all tests
    """
    print("\n" + "="*50)
    print("TEST SUITE COMPLETE")
    print("="*50)
    
    if exitstatus == 0:
        print("✅ All tests passed!")
    else:
        print(f"❌ Tests failed with exit status: {exitstatus}")
    
    print("="*50 + "\n")

