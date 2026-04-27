"""
FastAPI router for resume upload-related endpoints.

- POST /api/v1/resumes/upload-urls endpoint implementation

    Generates S3 presigned URLs for direct browser-to-S3 uploads. The router
only depends on the IStorageService port and is agnostic of the underlying
storage implementation (S3, GCS, etc.).
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from config import AppSettings, get_settings
from container import get_storage_service
from core.ports.storage_port import IStorageService
from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)


class ResumeUploadUrlRequest(BaseModel):
    """Request body for generating a presigned upload URL for a resume PDF."""

    file_name: str = Field(..., description="Original file name, e.g. 'cv.pdf'.")
    content_type: str = Field(
        ...,
        description="MIME type of the file to be uploaded, e.g. 'application/pdf'.",
    )


class ResumeUploadUrlResponse(BaseModel):
    """Response returned to the frontend with all information required for upload."""

    upload_url: str = Field(..., description="Presigned URL to upload the file via HTTP PUT.")
    s3_key: str = Field(..., description="S3 object key under the configured raw uploads prefix.")
    bucket: str = Field(..., description="Target S3 bucket name.")


router = APIRouter(prefix="/api/v1/resumes", tags=["Resumes"])

# Only PDF uploads are accepted — prevents arbitrary file types being stored
# in the raw-pdf/ prefix and keeps downstream parsing predictable.
_ALLOWED_CONTENT_TYPES = frozenset({"application/pdf"})


@router.post(
    "/upload-urls",
    response_model=ResumeUploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an S3 presigned upload URL for a resume PDF",
    response_description="Upload URL and S3 key information for the resume file.",
)
async def create_resume_upload_url(
    payload: ResumeUploadUrlRequest,
    user_id: str = Depends(get_current_user_id),
    storage_service: IStorageService = Depends(get_storage_service),
) -> ResumeUploadUrlResponse:
    """Create a presigned URL that allows the frontend to upload a resume directly to S3."""

    if payload.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type '{payload.content_type}'. Only PDF uploads are accepted.",
        )

    settings: AppSettings = get_settings()

    unique_suffix = uuid4().hex
    s3_key = f"{settings.s3_raw_prefix}{unique_suffix}_{payload.file_name}"

    logger.info("Generating presigned upload URL for key '%s' in bucket '%s'.", s3_key, settings.s3_bucket)

    upload_url = storage_service.generate_presigned_upload_url(
        object_key=s3_key,
        content_type=payload.content_type,
    )

    return ResumeUploadUrlResponse(upload_url=upload_url, s3_key=s3_key, bucket=settings.s3_bucket)

