"""Tests for Supabase JWT verification (HS256 + JWKS algorithms)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

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
