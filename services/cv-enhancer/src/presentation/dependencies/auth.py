"""
Auth dependency: verifies the Supabase-issued JWT from the Authorization header.

Usage in a router:
    user_id: str = Depends(get_current_user_id)
"""

import logging

import jwt
from fastapi import Header, HTTPException, status

from config import get_settings

logger = logging.getLogger(__name__)


async def get_current_user_id(
    authorization: str = Header(
        ...,
        description="Bearer <supabase_access_token>",
        alias="Authorization",
    ),
) -> str:
    """Extract and verify the Supabase JWT, returning the authenticated user's UUID.

    Raises:
        HTTPException 401: If the header is missing, malformed, expired, or invalid.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use the 'Bearer <token>' scheme.",
        )

    token = authorization[len("Bearer "):]
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            # Supabase tokens carry audience="authenticated"
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
        )
    except jwt.InvalidTokenError as exc:
        logger.debug("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token.",
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing the subject claim.",
        )

    return user_id
