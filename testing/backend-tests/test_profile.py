"""
User profile endpoint tests
"""
import pytest
import requests

def test_profile_get(backend_url, auth_headers):
    """
    Test GET /user/profile returns profile data including hasCompletedOnboarding.
    """
    response = requests.get(
        f"{backend_url}/user/profile",
        headers=auth_headers
    )
    
    assert response.status_code == 200, f"Profile GET failed: {response.status_code} - {response.text}"
    
    data = response.json()
    
    # Verify hasCompletedOnboarding field exists
    assert 'hasCompletedOnboarding' in data, "Profile missing 'hasCompletedOnboarding' field"
    
    # Verify it's a boolean
    assert isinstance(data['hasCompletedOnboarding'], bool), "hasCompletedOnboarding should be boolean"
    
    print(f"✓ Profile retrieved: hasCompletedOnboarding={data['hasCompletedOnboarding']}")
    
    return data

def test_profile_update_onboarding_true(backend_url, auth_headers):
    """
    Test POST /user/profile can set hasCompletedOnboarding to true.
    """
    # Set to true
    response = requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': True}
    )
    
    assert response.status_code == 200, f"Profile update failed: {response.status_code} - {response.text}"
    
    # Verify it was set
    get_response = requests.get(
        f"{backend_url}/user/profile",
        headers=auth_headers
    )
    
    assert get_response.status_code == 200
    data = get_response.json()
    
    assert data['hasCompletedOnboarding'] == True, f"Expected True, got {data['hasCompletedOnboarding']}"
    print("✓ hasCompletedOnboarding successfully set to True")

def test_profile_update_onboarding_false(backend_url, auth_headers):
    """
    Test POST /user/profile can set hasCompletedOnboarding to false.
    """
    # Set to false
    response = requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': False}
    )
    
    assert response.status_code == 200, f"Profile update failed: {response.status_code} - {response.text}"
    
    # Verify it was set
    get_response = requests.get(
        f"{backend_url}/user/profile",
        headers=auth_headers
    )
    
    assert get_response.status_code == 200
    data = get_response.json()
    
    assert data['hasCompletedOnboarding'] == False, f"Expected False, got {data['hasCompletedOnboarding']}"
    print("✓ hasCompletedOnboarding successfully set to False")

def test_profile_partial_update(backend_url, auth_headers):
    """
    Test that updating only hasCompletedOnboarding doesn't affect other fields.
    """
    # Get current profile
    before = requests.get(f"{backend_url}/user/profile", headers=auth_headers).json()
    
    # Update only onboarding
    requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': True}
    )
    
    # Get updated profile
    after = requests.get(f"{backend_url}/user/profile", headers=auth_headers).json()
    
    # Verify other fields unchanged
    assert after['name'] == before['name'], "Name should not change"
    assert after['email'] == before['email'], "Email should not change"
    assert after['phone'] == before['phone'], "Phone should not change"
    
    print("✓ Partial update preserves other fields")

