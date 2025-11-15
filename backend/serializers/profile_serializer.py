"""
Field name transformation layer
Converts between database snake_case and API camelCase
"""

def serialize_profile(profile_data):
    """Convert database fields to API format (snake_case → camelCase)"""
    if not profile_data:
        return {}
    
    return {
        'username': profile_data.get('username'),
        'email': profile_data.get('email'),
        'name': profile_data.get('name'),
        'phone': profile_data.get('phone'),
        'profilePhoto': profile_data.get('profile_photo'),  # snake → camel
        'hasCompletedOnboarding': profile_data.get('has_completed_onboarding'),  # snake → camel
        'createdAt': profile_data.get('created_at'),  # snake → camel
        'bio': profile_data.get('bio'),
        'socialMedia': profile_data.get('social_media')  # snake → camel
    }

def deserialize_profile(api_data):
    """Convert API fields to database format (camelCase → snake_case)"""
    if not api_data:
        return {}
    
    return {
        'username': api_data.get('username'),
        'email': api_data.get('email'),
        'name': api_data.get('name'),
        'phone': api_data.get('phone'),
        'profile_photo': api_data.get('profilePhoto'),  # camel → snake
        'has_completed_onboarding': api_data.get('hasCompletedOnboarding'),  # camel → snake
        'created_at': api_data.get('createdAt'),  # camel → snake
        'bio': api_data.get('bio'),
        'social_media': api_data.get('socialMedia')  # camel → snake
    }
