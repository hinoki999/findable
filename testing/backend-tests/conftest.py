"""
Pytest configuration and fixtures for DropLink backend tests
"""
import pytest
import requests
import os
import psycopg2

# Configuration from environment
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://findable-production.up.railway.app')
TEST_USER = 'caitie690'
TEST_PASSWORD = os.environ.get('TEST_PASSWORD', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')

@pytest.fixture(scope='session')
def backend_url():
    """Backend API URL"""
    return BACKEND_URL

@pytest.fixture(scope='session')
def test_credentials():
    """Test user credentials"""
    return {
        'username': TEST_USER,
        'password': TEST_PASSWORD
    }

@pytest.fixture(scope='session')
def auth_token(backend_url, test_credentials):
    """
    Authenticate and get JWT token for test user.
    This token is reused across all tests in the session.
    """
    if not test_credentials['password']:
        pytest.skip("TEST_PASSWORD environment variable not set")
    
    response = requests.post(
        f"{backend_url}/auth/login",
        json=test_credentials
    )
    
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    data = response.json()
    assert 'token' in data, "Response missing token"
    assert 'user_id' in data, "Response missing user_id"
    
    return {
        'token': data['token'],
        'user_id': data['user_id'],
        'username': data['username']
    }

@pytest.fixture(scope='session')
def auth_headers(auth_token):
    """Authorization headers for authenticated requests"""
    return {
        'Authorization': f"Bearer {auth_token['token']}",
        'Content-Type': 'application/json'
    }

@pytest.fixture(scope='session')
def db_connection():
    """
    PostgreSQL database connection to Railway.
    """
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL environment variable not set")
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        yield conn
        conn.close()
    except Exception as e:
        pytest.skip(f"Could not connect to database: {e}")

@pytest.fixture
def db_cursor(db_connection):
    """
    Database cursor for executing queries.
    Automatically commits after each test.
    """
    cursor = db_connection.cursor()
    yield cursor
    db_connection.commit()
    cursor.close()

