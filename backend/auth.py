"""
auth.py  —  shared by all services
JWT creation (user-service) and verification (all protected routes).
"""
import os
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please")
ALGORITHM  = "HS256"
EXPIRE_HOURS = 24

bearer = HTTPBearer()

# ── Token creation (used by user-service on login) ───────────

def create_access_token(user_id: int, email: str, name: str) -> str:
    payload = {
        "sub":   str(user_id),
        "email": email,
        "name":  name,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HOURS),
        "iat":   datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# ── Token verification (used by every protected route) ───────

class CurrentUser:
    def __init__(self, payload: dict):
        self.id:    int = int(payload["sub"])
        self.email: str = payload.get("email", "")
        self.name:  str = payload.get("name", "")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> CurrentUser:
    """
    FastAPI dependency — add to any route that needs auth:
        current_user: CurrentUser = Depends(get_current_user)
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return CurrentUser(payload)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
