# shared/auth.py
# ─────────────────────────────────────────────────────────────
#  Copy this file into every service's folder.
#  Usage:  from auth import get_current_user, CurrentUser
# ─────────────────────────────────────────────────────────────
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import os, httpx
from functools import lru_cache

bearer = HTTPBearer()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# ── Fetch Supabase public JWKS (cached) ──────────────────────
@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    url = f"{SUPABASE_URL}/auth/v1/jwks"
    r = httpx.get(url, headers={"apikey": SUPABASE_ANON_KEY}, timeout=10)
    r.raise_for_status()
    return r.json()

def _decode_token(token: str) -> dict:
    """Decode & verify a Supabase-issued JWT."""
    try:
        jwks = _get_jwks()
        # Supabase JWKS may have multiple keys; try each
        for key_data in jwks.get("keys", [jwks]):
            try:
                payload = jwt.decode(
                    token,
                    key_data,
                    algorithms=["RS256", "HS256"],
                    audience="authenticated",
                    options={"verify_aud": False},   # Supabase doesn't always set aud
                )
                return payload
            except JWTError:
                continue
        raise JWTError("No matching key")
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

class CurrentUser:
    """Parsed user info from the JWT."""
    def __init__(self, payload: dict):
        self.id: str   = payload.get("sub", "")
        self.email: str = payload.get("email", "")
        self.role: str  = payload.get("role", "authenticated")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> CurrentUser:
    """FastAPI dependency — inject into any route that needs auth."""
    payload = _decode_token(credentials.credentials)
    return CurrentUser(payload)
