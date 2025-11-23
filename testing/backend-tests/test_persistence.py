"""
Database persistence tests - verify data actually saves to PostgreSQL
"""
import pytest
import requests

def test_onboarding_persists_in_database(backend_url, auth_headers, auth_token, db_cursor):
    """
    Test that hasCompletedOnboarding updates persist to the database.
    
    1. Set hasCompletedOnboarding to True via API
    2. Query database directly to verify column value
    3. Verify database has has_completed_onboarding = 1 (or TRUE)
    """
    # Step 1: Update via API
    response = requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': True}
    )
    
    assert response.status_code == 200, f"API update failed: {response.text}"
    print(f"✓ API update successful for user_id {auth_token['user_id']}")
    
    # Step 2: Query database directly
    db_cursor.execute(
        "SELECT has_completed_onboarding FROM user_profiles WHERE user_id = %s",
        (auth_token['user_id'],)
    )
    
    result = db_cursor.fetchone()
    assert result is not None, f"No profile found in database for user_id {auth_token['user_id']}"
    
    db_value = result[0]
    
    # Step 3: Verify database value
    # In PostgreSQL, INTEGER 1 = True, 0 = False
    assert db_value in (1, True), f"Expected 1 or True, got {db_value}"
    
    print(f"✓ Database verification passed: has_completed_onboarding = {db_value}")

def test_onboarding_false_persists(backend_url, auth_headers, auth_token, db_cursor):
    """
    Test that setting hasCompletedOnboarding to False persists correctly.
    """
    # Set to False via API
    response = requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': False}
    )
    
    assert response.status_code == 200
    
    # Query database
    db_cursor.execute(
        "SELECT has_completed_onboarding FROM user_profiles WHERE user_id = %s",
        (auth_token['user_id'],)
    )
    
    result = db_cursor.fetchone()
    db_value = result[0]
    
    assert db_value in (0, False), f"Expected 0 or False, got {db_value}"
    print(f"✓ Database correctly stores False as {db_value}")

def test_multiple_updates_persist(backend_url, auth_headers, auth_token, db_cursor):
    """
    Test that multiple sequential updates all persist correctly.
    Simulates user completing tutorials multiple times.
    """
    # Update 1: Set to True
    requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': True}
    )
    
    db_cursor.execute(
        "SELECT has_completed_onboarding FROM user_profiles WHERE user_id = %s",
        (auth_token['user_id'],)
    )
    assert db_cursor.fetchone()[0] in (1, True)
    
    # Update 2: Set to False
    requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': False}
    )
    
    db_cursor.execute(
        "SELECT has_completed_onboarding FROM user_profiles WHERE user_id = %s",
        (auth_token['user_id'],)
    )
    assert db_cursor.fetchone()[0] in (0, False)
    
    # Update 3: Set back to True
    requests.post(
        f"{backend_url}/user/profile",
        headers=auth_headers,
        json={'hasCompletedOnboarding': True}
    )
    
    db_cursor.execute(
        "SELECT has_completed_onboarding FROM user_profiles WHERE user_id = %s",
        (auth_token['user_id'],)
    )
    assert db_cursor.fetchone()[0] in (1, True)
    
    print("✓ Multiple updates persist correctly")

def test_database_schema_correct(db_cursor):
    """
    Verify the user_profiles table has the correct schema.
    """
    # Check table exists
    db_cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'user_profiles'
        )
    """)
    
    assert db_cursor.fetchone()[0] == True, "user_profiles table does not exist"
    
    # Check column exists
    db_cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_profiles' 
            AND column_name = 'has_completed_onboarding'
        )
    """)
    
    assert db_cursor.fetchone()[0] == True, "has_completed_onboarding column does not exist"
    
    print("✓ Database schema verified: user_profiles.has_completed_onboarding exists")

