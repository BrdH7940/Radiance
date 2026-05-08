"""
Rate limiters for the CV Enhancer API — DynamoDB-backed for Lambda safety.

Two limiters are provided:
  - check_analysis_rate_limit : 10 requests/hour  — heavy pipeline (SQS + LLM + S3)
  - check_editor_rate_limit   : 60 requests/hour  — lighter workspace operations

Each limiter uses DynamoDB's atomic UpdateItem (ADD) to maintain a per-user,
per-hour counter that is shared across all Lambda instances. The existing
DynamoDB analysis table is reused: rate-limit items are stored under a dedicated
SK prefix (``RATE_LIMIT#<label>#<user_id>#<window>``) so they do not collide
with job records. Items carry a TTL attribute for automatic expiry.

Falls back to an in-memory sliding window if DynamoDB is unavailable (e.g.
local dev without DynamoDB Local), preserving the original behaviour.
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import Depends, HTTPException, status

from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

_WINDOW = timedelta(hours=1)
_ANALYSIS_LIMIT = 10
_EDITOR_LIMIT = 60

# ── DynamoDB client (module-level — reused across warm Lambda invocations) ────

_dynamo_client: Optional[object] = None
_dynamo_pk_name: str = "UserId"
_dynamo_sk_name: Optional[str] = "id"
_dynamo_table_name: str = ""
_dynamo_pk_value: str = "local"


def _init_dynamo() -> bool:
    """Lazy-initialise the DynamoDB client and discover the table's key schema.

    Returns True when initialisation succeeds, False otherwise (triggers in-memory fallback).
    """
    global _dynamo_client, _dynamo_pk_name, _dynamo_sk_name, _dynamo_table_name, _dynamo_pk_value

    if _dynamo_client is not None:
        return True

    try:
        from config import get_settings
        settings = get_settings()
        _dynamo_table_name = settings.dynamodb_table_name
        _dynamo_pk_value = settings.analysis_user_id

        client = boto3.client(
            "dynamodb",
            region_name=settings.aws_region,
            endpoint_url=settings.dynamodb_endpoint_url or None,
        )

        # Discover the table's real PK/SK attribute names.
        try:
            desc = client.describe_table(TableName=_dynamo_table_name)["Table"]
            for k in desc.get("KeySchema", []):
                if k.get("KeyType") == "HASH":
                    _dynamo_pk_name = k["AttributeName"]
                elif k.get("KeyType") == "RANGE":
                    _dynamo_sk_name = k["AttributeName"]
        except ClientError:
            # describe_table may be restricted by IAM — keep defaults and proceed.
            pass

        _dynamo_client = client
        return True
    except Exception as exc:
        logger.warning("Rate limiter DynamoDB init failed, using in-memory fallback: %s", exc)
        return False


def _current_window() -> str:
    """Return the current UTC hour as a sortable string (e.g. '2024-01-15T10')."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H")


def _window_ttl() -> int:
    """Return a Unix timestamp 2 hours after the start of the current hour."""
    window_start = datetime.now(tz=timezone.utc).replace(minute=0, second=0, microsecond=0)
    return int((window_start + timedelta(hours=2)).timestamp())


def _enforce_limit_dynamo(user_id: str, label: str, limit: int) -> None:
    """Atomically increment and check a per-user hourly counter in DynamoDB.

    Uses UpdateItem ADD so concurrent Lambda instances can't race past the limit.
    The increment is *not* rolled back on rejection — rejected requests count
    toward the quota (standard rate-limiter convention).
    """
    window = _current_window()
    sk_value = f"RATE_LIMIT#{label}#{user_id}#{window}"

    key: dict = {_dynamo_pk_name: {"S": _dynamo_pk_value}}
    if _dynamo_sk_name:
        key[_dynamo_sk_name] = {"S": sk_value}

    response = _dynamo_client.update_item(  # type: ignore[union-attr]
        TableName=_dynamo_table_name,
        Key=key,
        UpdateExpression="ADD rate_count :one SET expires_at = if_not_exists(expires_at, :ttl)",
        ExpressionAttributeValues={
            ":one": {"N": "1"},
            ":ttl": {"N": str(_window_ttl())},
        },
        ReturnValues="UPDATED_NEW",
    )

    count = int(response["Attributes"]["rate_count"]["N"])
    logger.debug(
        "Rate limit DynamoDB (%s) user='%s' window='%s': %d/%d",
        label, user_id, window, count, limit,
    )

    if count > limit:
        logger.warning(
            "Rate limit exceeded (%s) for user '%s': %d/%d in window '%s'.",
            label, user_id, count, limit, window,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {limit} {label} requests "
                "per hour. Please wait before trying again."
            ),
        )


# ── In-memory fallback (local dev / DynamoDB unavailable) ────────────────────

_MEMORY_LOG: dict[str, list[datetime]] = defaultdict(list)


def _enforce_limit_memory(user_id: str, label: str, limit: int) -> None:
    """Sliding-window rate limit backed by a module-level dict.

    Only reliable within a single process — use as a fallback when DynamoDB
    is unavailable (e.g. local development without DynamoDB Local).
    """
    now = datetime.utcnow()
    cutoff = now - _WINDOW
    key = f"{label}#{user_id}"

    _MEMORY_LOG[key] = [t for t in _MEMORY_LOG[key] if t > cutoff]

    if len(_MEMORY_LOG[key]) >= limit:
        logger.warning(
            "Rate limit exceeded (%s) for user '%s': %d/%d requests in the last hour.",
            label, user_id, len(_MEMORY_LOG[key]), limit,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {limit} {label} requests "
                "per hour. Please wait before trying again."
            ),
        )

    _MEMORY_LOG[key].append(now)
    logger.debug(
        "Rate limit memory OK (%s) for user '%s': %d/%d in window.",
        label, user_id, len(_MEMORY_LOG[key]), limit,
    )


# ── Shared dispatcher ─────────────────────────────────────────────────────────


def _enforce_limit(user_id: str, label: str, limit: int) -> None:
    """Enforce a rate limit — DynamoDB-first with in-memory fallback."""
    dynamo_ok = _init_dynamo()

    if dynamo_ok:
        try:
            _enforce_limit_dynamo(user_id, label, limit)
            return
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(
                "DynamoDB rate limit check failed for user '%s' (%s), "
                "falling back to in-memory: %s",
                user_id, label, exc,
            )

    _enforce_limit_memory(user_id, label, limit)


# ── Public FastAPI dependencies ───────────────────────────────────────────────


async def check_analysis_rate_limit(
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Enforce the CV analysis rate limit (10 requests/hour per user)."""
    await asyncio.to_thread(_enforce_limit, user_id, "analysis", _ANALYSIS_LIMIT)


async def check_editor_rate_limit(
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Enforce the workspace editor rate limit (60 requests/hour per user)."""
    await asyncio.to_thread(_enforce_limit, user_id, "editor", _EDITOR_LIMIT)
