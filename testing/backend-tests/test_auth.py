"""
Authentication endpoint tests
"""
import pytest
import requests

def test_login_success(backend_url, test_credentials):
    """
    Test successful login with valid credentials.
    Verifies response contains token, user_id, and username.
    """
    response = requests.post(
        f"{backend_url}/auth/login",
        json=test_credentials
    )
    
    assert response.status_code == 200, f"Login failed with status {response.status_code}: {response.text}"
    
    data = response.json()
    
    # Verify response structure
    assert 'token' in data, "Response missing 'token' field"
    assert 'user_id' in data, "Response missing 'user_id' field"
    assert 'username' in data, "Response missing 'username' field"
    
    # Verify values
    assert isinstance(data['token'], str), "Token should be a string"
    assert len(data['token']) > 0, "Token should not be empty"
    assert isinstance(data['user_id'], int), "user_id should be an integer"
    assert data['username'] == test_credentials['username'], "Username mismatch"
    
    print(f"✓ Login successful for user {data['username']} (ID: {data['user_id']})")

def test_login_invalid_password(backend_url, test_credentials):
    """
    Test login with invalid password returns 401.
    """
    invalid_creds = {
        'username': test_credentials['username'],
        'password': 'wrong_password_12345'
    }
    
    response = requests.post(
        f"{backend_url}/auth/login",
        json=invalid_creds
    )
    
    assert response.status_code == 401, f"Expected 401 for invalid password, got {response.status_code}"
    print("✓ Invalid password correctly rejected")

def test_token_validity(backend_url, auth_token):
    """
    Test that the JWT token can be used to access protected endpoints.
    """
    headers = {
        'Authorization': f"Bearer {auth_token['token']}",
        'Content-Type': 'application/json'
    }
    
    response = requests.get(
        f"{backend_url}/user/profile",
        headers=headers
    )
    
    assert response.status_code == 200, f"Token validation failed: {response.status_code} - {response.text}"
    print(f"✓ Token valid for user {auth_token['username']}")

