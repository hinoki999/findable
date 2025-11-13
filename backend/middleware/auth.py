from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import logging
import os

logger = logging.getLogger(__name__)

# Get SECRET_KEY from environment
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production-12345")

class JWTBearer(HTTPBearer):
    def __init__(self, auto_error: bool = True):
        super(JWTBearer, self).__init__(auto_error=auto_error)

    async def __call__(self, request: Request):
        """Enhanced token extraction and validation"""
        token = None
        
        # Try Authorization header first
        auth_header = request.headers.get("Authorization")
        if auth_header:
            # Handle both "Bearer token" and just "token"
            parts = auth_header.split()
            if len(parts) == 2 and parts[0] == "Bearer":
                token = parts[1]
            elif len(parts) == 1:
                token = parts[0]
            logger.debug(f"Token from header: {token[:20] if token else 'None'}...")
        
        # Check cookies (for web app)
        if not token and "token" in request.cookies:
            token = request.cookies["token"]
            logger.debug(f"Token from cookies: {token[:20]}...")
        
        # Check query params (for mobile app)
        if not token and "token" in request.query_params:
            token = request.query_params["token"]
            logger.debug(f"Token from query: {token[:20]}...")
        
        if not token:
            # Log what headers we received for debugging
            logger.warning(f"No token found. Headers: {dict(request.headers)}")
            raise HTTPException(status_code=401, detail="No authentication token")
        
        # Validate token format (JWT should have 3 segments)
        if token.count('.') != 2:
            logger.error(f"Invalid token format: {token[:20]}... (segments: {token.count('.')+1})")
            raise HTTPException(status_code=401, detail="Invalid token format")
        
        # Verify token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            logger.info(f"✅ Token valid for user: {payload.get('user_id')}")
            return payload
        except jwt.ExpiredSignatureError:
            logger.error("Token expired")
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError as e:
            logger.error(f"Token validation failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")
