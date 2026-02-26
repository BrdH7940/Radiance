"""
S3-backed implementation of the IStorageService port.
"""

from typing import Dict

import boto3

from config import AppSettings
from domain.ports import IStorageService


class S3StorageAdapter(IStorageService):
    """AWS S3 implementation of the storage service port."""

    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

        client_kwargs: Dict[str, str] = {
            "region_name": settings.aws_region,
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
        }

        if settings.aws_session_token:
            client_kwargs["aws_session_token"] = settings.aws_session_token

        self._client = boto3.client("s3", **client_kwargs)

    def generate_presigned_upload_url(self, object_key: str, content_type: str) -> str:
        """Generate a pre-signed URL for uploading an object to S3 using HTTP PUT."""

        return self._client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self._settings.s3_bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=self._settings.s3_presigned_expiration_seconds,
        )

