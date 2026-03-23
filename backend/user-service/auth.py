import os
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ALGORITHM  = "HS256"
EXPIRE_HOURS = 24

bearer = HTTPBearer()

def create_access_token(user_id: int, email: str, name: str) -> str:
    payload = {
        "sub":   str(user_id),
        "email": email,
        "name":  name,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HOURS),
        "iat":   datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

class CurrentUser:
    def __init__(self, payload: dict):
        self.id:    int = int(payload["sub"])
        self.email: str = payload.get("email", "")
        self.name:  str = payload.get("name", "")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> CurrentUser:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return CurrentUser(payload)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )