"""
AWS X-Ray bootstrap helpers.

This module is intentionally safe to import even when X-Ray isn't enabled.
All integrations are best-effort and should never break local dev or CI.
"""

from __future__ import annotations

import os
from typing import Any, Optional


def _truthy(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def init_xray() -> bool:
    """Patch supported libraries (boto3/botocore, etc.). Returns True if patched."""
    # Allow explicitly disabling via env, while defaulting to enabled.
    if _truthy(os.getenv("XRAY_DISABLED")):
        return False

    try:
        from aws_xray_sdk.core import patch_all  # type: ignore

        patch_all()
        return True
    except Exception:
        # Swallow all errors: tracing must never break the app.
        return False


def instrument_fastapi(app: Any) -> bool:
    """Attach X-Ray middleware to a FastAPI app. Returns True if attached."""
    if _truthy(os.getenv("XRAY_DISABLED")):
        return False

    try:
        from aws_xray_sdk.ext.fastapi.middleware import XRayMiddleware  # type: ignore

        # Prefer explicit service name, else Lambda function name, else fallback.
        service_name = (
            os.getenv("XRAY_SERVICE_NAME")
            or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
            or "cv-enhancer"
        )
        app.add_middleware(XRayMiddleware, recorder=None, service=service_name)
        return True
    except Exception:
        return False


def annotate_kv(key: str, value: Any) -> None:
    """Best-effort X-Ray annotation."""
    try:
        from aws_xray_sdk.core import xray_recorder  # type: ignore

        # annotations must be simple scalar types; stringify as needed
        if isinstance(value, (str, int, float, bool)) or value is None:
            xray_recorder.put_annotation(key, value)
        else:
            xray_recorder.put_annotation(key, str(value))
    except Exception:
        return None


def with_subsegment(name: str):
    """Context manager for a subsegment; no-op if unavailable."""
    try:
        from aws_xray_sdk.core import xray_recorder  # type: ignore

        return xray_recorder.in_subsegment(name)
    except Exception:
        # Fallback context manager
        class _Noop:
            def __enter__(self):  # noqa: D401
                return None

            def __exit__(self, exc_type, exc, tb):
                return False

        return _Noop()

