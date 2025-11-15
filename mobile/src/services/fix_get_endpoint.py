"""
Fix GET /user/profile endpoint to use get_current_user instead of JWTBearer
This makes it consistent with POST /user/profile which works correctly
"""

file_path = r"C:\Users\caiti\Documents\droplin\backend\main.py"

# Read the file
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the GET endpoint definition
old_code = '''@app.get("/user/profile")
async def get_user_profile(payload = Depends(JWTBearer())):
    """Get user profile with authentication via JWTBearer middleware"""
    try:
        from serializers.profile_serializer import serialize_profile
        
        # Extract user_id from JWT payload
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")'''

new_code = '''@app.get("/user/profile")
async def get_user_profile(user_id: int = Depends(get_current_user)):
    """Get user profile with authentication"""
    try:
        from serializers.profile_serializer import serialize_profile'''

content = content.replace(old_code, new_code)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed GET /user/profile endpoint to use get_current_user")
print("✅ Removed JWTBearer() dependency")
print("✅ Endpoint now matches POST /user/profile authentication method")
