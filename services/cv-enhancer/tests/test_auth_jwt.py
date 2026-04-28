"""Tests for Supabase JWT verification (HS256 + JWKS algorithms) and get_current_user_id."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from presentation.dependencies import auth


@pytest.fixture(autouse=True)
def clear_jwks_cache() -> None:
    auth._jwks_client.cache_clear()
    yield
    auth._jwks_client.cache_clear()


def test_decode_hs256_valid() -> None:
    secret = "test-secret-for-jwt-hs256-verification!"
    sub = str(uuid.uuid4())
    token = jwt.encode(
        {
            "sub": sub,
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        secret,
        algorithm="HS256",
    )
    payload = auth.decode_supabase_access_token(
        token,
        supabase_url="https://abc.supabase.co",
        jwt_secret=secret,
    )
    assert payload["sub"] == sub


def test_decode_hs256_wrong_secret() -> None:
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "correct-secret",
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        auth.decode_supabase_access_token(
            token,
            supabase_url="https://abc.supabase.co",
            jwt_secret="wrong-secret",
        )


def test_decode_expired() -> None:
    secret = "test-secret-for-jwt-hs256-verification!"
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": "authenticated",
            "exp": datetime.now(UTC) - timedelta(seconds=1),
        },
        secret,
        algorithm="HS256",
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        auth.decode_supabase_access_token(
            token,
            supabase_url="https://abc.supabase.co",
            jwt_secret=secret,
        )


def test_decode_unsupported_algorithm() -> None:
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "secret",
        algorithm="HS384",
    )
    with pytest.raises(jwt.InvalidTokenError, match="Unsupported JWT algorithm"):
        auth.decode_supabase_access_token(
            token,
            supabase_url="https://abc.supabase.co",
            jwt_secret="secret",
        )


def test_decode_es256_with_jwks_mock() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    sub = str(uuid.uuid4())
    token = jwt.encode(
        {
            "sub": sub,
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        private_key,
        algorithm="ES256",
    )
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.return_value = SimpleNamespace(
        key=private_key.public_key()
    )
    with patch.object(auth, "PyJWKClient", return_value=mock_client):
        payload = auth.decode_supabase_access_token(
            token,
            supabase_url="https://abc.supabase.co",
            jwt_secret="unused-for-es256",
        )
    assert payload["sub"] == sub
    mock_client.get_signing_key_from_jwt.assert_called_once()


# ---------------------------------------------------------------------------
# get_current_user_id — FastAPI dependency
# ---------------------------------------------------------------------------

_HS256_SECRET = "test-secret-for-get-current-user-id!"
_SUPABASE_URL = "https://abc.supabase.co"


def _make_settings():
    return SimpleNamespace(
        supabase_url=_SUPABASE_URL,
        supabase_jwt_secret=_HS256_SECRET,
    )


def _valid_hs256_token(sub: str | None = None, expired: bool = False) -> str:
    sub = sub or str(uuid.uuid4())
    exp_delta = timedelta(seconds=-1) if expired else timedelta(hours=1)
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "exp": datetime.now(UTC) + exp_delta},
        _HS256_SECRET,
        algorithm="HS256",
    )


@pytest.mark.asyncio
async def test_get_current_user_id_returns_sub_for_valid_token():
    sub = str(uuid.uuid4())
    token = _valid_hs256_token(sub=sub)

    with patch("presentation.dependencies.auth.get_settings", return_value=_make_settings()):
        result = await auth.get_current_user_id(authorization=f"Bearer {token}")

    assert result == sub


@pytest.mark.asyncio
async def test_get_current_user_id_raises_401_when_bearer_prefix_missing():
    with pytest.raises(HTTPException) as exc_info:
        await auth.get_current_user_id(authorization="Token abc123")

    assert exc_info.value.status_code == 401
    assert "Bearer" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_current_user_id_raises_401_when_token_expired():
    token = _valid_hs256_token(expired=True)

    with patch("presentation.dependencies.auth.get_settings", return_value=_make_settings()):
        with pytest.raises(HTTPException) as exc_info:
            await auth.get_current_user_id(authorization=f"Bearer {token}")

    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_current_user_id_raises_401_for_invalid_token():
    with patch("presentation.dependencies.auth.get_settings", return_value=_make_settings()):
        with pytest.raises(HTTPException) as exc_info:
            await auth.get_current_user_id(authorization="Bearer not.a.valid.jwt")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_id_raises_401_when_sub_missing():
    """A token with no 'sub' claim must result in HTTP 401."""
    token = jwt.encode(
        {"aud": "authenticated", "exp": datetime.now(UTC) + timedelta(hours=1)},
        _HS256_SECRET,
        algorithm="HS256",
    )

    with patch("presentation.dependencies.auth.get_settings", return_value=_make_settings()):
        with pytest.raises(HTTPException) as exc_info:
            await auth.get_current_user_id(authorization=f"Bearer {token}")

    assert exc_info.value.status_code == 401
    assert "subject" in exc_info.value.detail.lower()
