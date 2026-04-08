"""
In-memory rate limiters for the CV Enhancer API.

Two limiters are provided:
  - check_analysis_rate_limit : 10 requests/hour  — heavy pipeline (SQS + LLM + S3)
  - check_editor_rate_limit   : 60 requests/hour  — lighter workspace operations

⚠️  Lambda note: Each Lambda invocation has its own isolated memory space,
so these limiters are only effective for local/container deployments.
For production Lambda, replace the _*_LOG dicts with a DynamoDB or Redis store.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status

from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

_WINDOW = timedelta(hours=1)

# ── Analysis limiter ─────────────────────────────────────────────────────────

_ANALYSIS_LIMIT = 10
_ANALYSIS_LOG: dict[str, list[datetime]] = defaultdict(list)

# ── Editor limiter ───────────────────────────────────────────────────────────

_EDITOR_LIMIT = 60
_EDITOR_LOG: dict[str, list[datetime]] = defaultdict(list)


# ── Shared helper ─────────────────────────────────────────────────────────────


def _enforce_limit(
    user_id: str,
    log: dict[str, list[datetime]],
    limit: int,
    label: str,
) -> None:
    """Sliding-window rate limit check. Mutates `log` in place.

    Args:
        user_id: Authenticated user's UUID string.
        log:     Module-level timestamp dict for this limiter.
        limit:   Maximum allowed requests per window.
        label:   Human-readable name used in log messages and error detail.

    Raises:
        HTTPException 429: When the limit has been exceeded.
    """
    now = datetime.utcnow()
    cutoff = now - _WINDOW

    log[user_id] = [t for t in log[user_id] if t > cutoff]

    if len(log[user_id]) >= limit:
        logger.warning(
            "Rate limit exceeded (%s) for user '%s': %d/%d requests in the last hour.",
            label,
            user_id,
            len(log[user_id]),
            limit,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {limit} {label} requests "
                "per hour. Please wait before trying again."
            ),
        )

    log[user_id].append(now)
    logger.debug(
        "Rate limit OK (%s) for user '%s': %d/%d in window.",
        label,
        user_id,
        len(log[user_id]),
        limit,
    )


# ── Public FastAPI dependencies ───────────────────────────────────────────────


async def check_analysis_rate_limit(
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Enforce the CV analysis rate limit (10 requests/hour per user)."""
    _enforce_limit(user_id, _ANALYSIS_LOG, _ANALYSIS_LIMIT, "analysis")


async def check_editor_rate_limit(
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Enforce the workspace editor rate limit (60 requests/hour per user)."""
    _enforce_limit(user_id, _EDITOR_LOG, _EDITOR_LIMIT, "editor")
