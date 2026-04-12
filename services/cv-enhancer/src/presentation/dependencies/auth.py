"""
Auth dependency: verifies the Supabase-issued JWT from the Authorization header.

Supports:
- HS256 (legacy JWT secret) and ES256/RS256 via Supabase JWKS (signing keys).

Usage in a router:
    user_id: str = Depends(get_current_user_id)
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status

from config import get_settings

logger = logging.getLogger(__name__)

_JWKS_SUPPORTED = frozenset({"ES256", "RS256"})


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url)


def _jwks_url(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def decode_supabase_access_token(
    token: str,
    *,
    supabase_url: str,
    jwt_secret: str,
) -> dict:
    """Verify a Supabase access token and return the JWT payload (sync; may perform I/O for JWKS)."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as exc:
        raise jwt.InvalidTokenError("Could not parse JWT header.") from exc

    alg = header.get("alg")
    if alg == "HS256":
        return jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    if alg in _JWKS_SUPPORTED:
        url = _jwks_url(supabase_url)
        signing_key = _jwks_client(url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            audience="authenticated",
        )
    raise jwt.InvalidTokenError(f"Unsupported JWT algorithm: {alg!r}")


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
        payload = await asyncio.to_thread(
            decode_supabase_access_token,
            token,
            supabase_url=settings.supabase_url,
            jwt_secret=settings.supabase_jwt_secret,
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
