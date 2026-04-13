"""
LangSmith bootstrap helpers.

LangSmith tracing for LangChain/LangGraph is primarily controlled via env vars.
This module only normalizes env to avoid surprises across environments.
"""

from __future__ import annotations

import os
from typing import Optional


def _set_default(key: str, value: str) -> None:
    if os.getenv(key) is None:
        os.environ[key] = value


def _truthy(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def init_langsmith() -> bool:
    """
    Ensure env is consistent for LangSmith tracing.

    Returns True if tracing is intended to be enabled (based on env).
    """
    # If user set LANGSMITH_TRACING, respect it. Otherwise default to "true"
    # when an API key is present (so prod + non-prod behave consistently).
    if os.getenv("LANGSMITH_TRACING") is None:
        if os.getenv("LANGSMITH_API_KEY"):
            os.environ["LANGSMITH_TRACING"] = "true"

    tracing_on = _truthy(os.getenv("LANGSMITH_TRACING"))
    if not tracing_on:
        return False

    # Endpoint is optional; default is LangSmith SaaS.
    _set_default("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")

    # Compatibility flag for some LangChain versions / docs.
    _set_default("LANGCHAIN_TRACING_V2", "true")

    return True

