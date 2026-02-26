"""
Application configuration for the CV Enhancer service.

This module centralises environment-based settings using Pydantic's BaseSettings,
so that infrastructure adapters (e.g. S3 storage) receive their configuration
via dependency injection instead of reading environment variables directly.
"""

from functools import lru_cache
from typing import Optional

from pydantic import BaseSettings, Field


class AppSettings(BaseSettings):
    """Strongly-typed application settings loaded from the environment."""

    aws_region: str = Field(..., alias="AWS_REGION", description="AWS region for S3 operations.")
    aws_access_key_id: str = Field(
        ...,
        alias="AWS_ACCESS_KEY_ID",
        description="AWS access key ID used for programmatic access.",
    )
    aws_secret_access_key: str = Field(
        ...,
        alias="AWS_SECRET_ACCESS_KEY",
        description="AWS secret access key used for programmatic access.",
    )
    aws_session_token: Optional[str] = Field(
        default=None,
        alias="AWS_SESSION_TOKEN",
        description="Optional AWS session token (for temporary credentials).",
    )

    s3_bucket: str = Field(
        ...,
        alias="AWS_S3_BUCKET",
        description="Primary S3 bucket used for CV uploads and enhanced PDFs.",
    )
    s3_raw_prefix: str = Field(
        default="raw-pdf/",
        alias="AWS_S3_RAW_PREFIX",
        description="Key prefix inside the bucket where raw CV PDFs are uploaded.",
    )
    s3_enhanced_prefix: str = Field(
        default="enhanced-pdf/",
        alias="AWS_S3_ENHANCED_PREFIX",
        description="Key prefix inside the bucket where enhanced CV PDFs are stored.",
    )
    s3_presigned_expiration_seconds: int = Field(
        default=900,
        alias="AWS_S3_PRESIGNED_EXPIRATION_SECONDS",
        description="Lifetime (in seconds) for generated S3 presigned URLs.",
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return a cached instance of application settings.

    Using an LRU cache ensures we only parse environment variables once while
    still allowing FastAPI dependencies to retrieve settings efficiently.
    """

    return AppSettings()

