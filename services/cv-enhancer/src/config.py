"""
Application configuration for the CV Enhancer service.

Centralises all environment-based settings via Pydantic BaseSettings so that
infrastructure adapters (S3, Gemini, etc.) receive their configuration through
dependency injection rather than reading os.environ directly.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """Strongly-typed, environment-driven application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # ── AI ──────────────────────────────────────────────────────────────────────
    google_api_key: str = Field(alias="GOOGLE_API_KEY")
    gemini_model: str = Field(default="gemini-1.5-flash", alias="GEMINI_MODEL")

    # ── AWS credentials ─────────────────────────────────────────────────────────
    aws_region: str = Field(alias="AWS_REGION")
    aws_access_key_id: str = Field(alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(alias="AWS_SECRET_ACCESS_KEY")
    aws_session_token: Optional[str] = Field(default=None, alias="AWS_SESSION_TOKEN")

    # ── S3 bucket settings ──────────────────────────────────────────────────────
    s3_bucket: str = Field(alias="AWS_S3_BUCKET")
    s3_raw_prefix: str = Field(default="raw-pdf/", alias="AWS_S3_RAW_PREFIX")
    s3_enhanced_prefix: str = Field(
        default="enhanced-pdf/", alias="AWS_S3_ENHANCED_PREFIX"
    )
    s3_presigned_upload_expiration: int = Field(
        default=900, alias="AWS_S3_PRESIGNED_UPLOAD_EXPIRATION_SECONDS"
    )
    s3_presigned_download_expiration: int = Field(
        default=3600, alias="AWS_S3_PRESIGNED_DOWNLOAD_EXPIRATION_SECONDS"
    )

    # ── DynamoDB & SQS settings ────────────────────────────────────────────────
    dynamodb_table_name: str = Field(alias="DYNAMODB_ANALYSIS_TABLE_NAME")
    dynamodb_endpoint_url: Optional[str] = Field(
        default=None, alias="DYNAMODB_ENDPOINT_URL"
    )
    analysis_user_id: str = Field(default="local", alias="ANALYSIS_USER_ID")
    sqs_queue_url: str = Field(alias="SQS_QUEUE_URL")
    sqs_endpoint_url: Optional[str] = Field(default=None, alias="SQS_ENDPOINT_URL")


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return a cached, singleton instance of AppSettings.

    Using lru_cache ensures the environment is parsed exactly once at startup,
    while remaining mockable in tests via cache_clear().
    """
    return AppSettings()
