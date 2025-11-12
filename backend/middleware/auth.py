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
        # Log the request details
        logger.info(f"Auth check: {request.method} {request.url.path}")
        
        # Check for token in different places
        token = None
        
        # 1. Check Authorization header
        try:
            credentials: HTTPAuthorizationCredentials = await super().__call__(request)
            if credentials:
                token = credentials.credentials
                logger.info(f"Token found in Authorization header")
        except HTTPException:
            pass  # No token in header, try other methods
        
        # 2. Check cookies (for web app)
        if not token and "token" in request.cookies:
            token = request.cookies["token"]
            logger.info(f"Token found in cookies")
        
        # 3. Check query params (for mobile app)
        if not token and "token" in request.query_params:
            token = request.query_params["token"]
            logger.info(f"Token found in query params")
            
        if not token:
            logger.warning(f"No token found for {request.method} {request.url.path}")
            raise HTTPException(status_code=401, detail="No authentication token found")
            
        # Verify token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            logger.info(f"Token valid for user: {payload.get('user_id')}")
            return payload
        except jwt.ExpiredSignatureError:
            logger.error("Token expired")
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError as e:
            logger.error(f"Invalid token: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

