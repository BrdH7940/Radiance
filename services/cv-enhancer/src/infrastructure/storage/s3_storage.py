"""
AWS S3 implementation of the IStorageService port.

This adapter is the only place in the entire codebase that touches boto3.
All other modules interact with IStorageService exclusively.
"""

import logging
from typing import Any, Dict

import boto3
from botocore.exceptions import ClientError

from config import AppSettings
from core.ports.storage_port import IStorageService

logger = logging.getLogger(__name__)


class S3StorageAdapter(IStorageService):
    """AWS S3 implementation of the IStorageService port."""

    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

        client_kwargs: Dict[str, Any] = {
            "region_name": settings.aws_region,
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
        }
        if settings.aws_session_token:
            client_kwargs["aws_session_token"] = settings.aws_session_token

        self._client = boto3.client("s3", **client_kwargs)
        logger.info(
            "S3StorageAdapter initialised — bucket: '%s', region: '%s'.",
            settings.s3_bucket,
            settings.aws_region,
        )

    # ── Upload Presigned URL ────────────────────────────────────────────────────

    def generate_presigned_upload_url(self, object_key: str, content_type: str) -> str:
        """Generate a presigned PUT URL so the client can upload directly to S3."""
        url: str = self._client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self._settings.s3_bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=self._settings.s3_presigned_upload_expiration,
        )
        logger.debug("Presigned upload URL generated for key '%s'.", object_key)
        return url

    # ── Download Object ─────────────────────────────────────────────────────────

    def download_object(self, object_key: str, local_path: str) -> None:
        """Download an S3 object to a local path.

        Raises:
            FileNotFoundError: If the key does not exist in the configured bucket.
        """
        try:
            logger.info(
                "Downloading s3://%s/%s → %s",
                self._settings.s3_bucket,
                object_key,
                local_path,
            )
            self._client.download_file(
                Bucket=self._settings.s3_bucket,
                Key=object_key,
                Filename=local_path,
            )
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                raise FileNotFoundError(
                    f"S3 object '{object_key}' not found in bucket '{self._settings.s3_bucket}'."
                ) from exc
            raise

    # ── Upload File ─────────────────────────────────────────────────────────────

    def upload_file(
        self,
        local_path: str,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a local file to S3 and return its object key."""
        logger.info(
            "Uploading %s → s3://%s/%s",
            local_path,
            self._settings.s3_bucket,
            object_key,
        )
        self._client.upload_file(
            Filename=local_path,
            Bucket=self._settings.s3_bucket,
            Key=object_key,
            ExtraArgs={"ContentType": content_type},
        )
        logger.info("Upload complete: '%s'.", object_key)
        return object_key

    # ── Download Presigned URL ──────────────────────────────────────────────────

    def generate_presigned_download_url(self, object_key: str) -> str:
        """Generate a presigned GET URL for downloading an object."""
        url: str = self._client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": self._settings.s3_bucket,
                "Key": object_key,
            },
            ExpiresIn=self._settings.s3_presigned_download_expiration,
        )
        logger.debug("Presigned download URL generated for key '%s'.", object_key)
        return url
