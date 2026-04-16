"""
FastAPI router for the workspace editor:
  - Renders: CVResumeSchema JSON → HTML → PDF (WeasyPrint) → S3 presigned URL.
"""

import tempfile
from uuid import uuid4

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from config import AppSettings, get_settings
from container import get_pdf_renderer, get_storage_service
from core.domain.cv_resume_schema import CVResumeSchema
from core.ports.pdf_render_port import IPDFRenderService
from domain.ports import IStorageService
from presentation.dependencies.auth import get_current_user_id
from presentation.dependencies.rate_limiter import check_editor_rate_limit

router = APIRouter(prefix="/api/v1/editor", tags=["Editor"])


# ─── Renders ─────────────────────────────────────────────────────────────────


class RenderRequest(BaseModel):
    cv_data: CVResumeSchema = Field(
        ..., description="Complete structured CV data to render as PDF."
    )


class RenderResponse(BaseModel):
    pdf_url: str = Field(..., description="Presigned URL of the compiled PDF in S3.")
    success: bool = Field(True, description="Whether rendering and upload succeeded.")
    error: str | None = Field(None, description="Error message if success is False.")


@router.post(
    "/renders",
    response_model=RenderResponse,
    status_code=status.HTTP_200_OK,
    summary="Render CV JSON to PDF and upload to S3",
)
async def create_render(
    payload: RenderRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_check: None = Depends(check_editor_rate_limit),
    storage: IStorageService = Depends(get_storage_service),
    pdf_renderer: IPDFRenderService = Depends(get_pdf_renderer),
) -> RenderResponse:
    """Render the structured CV data to PDF via HTML/WeasyPrint, upload to S3, return presigned URL."""
    settings: AppSettings = get_settings()
    s3_key = f"{settings.s3_enhanced_prefix}{uuid4().hex}_workspace.pdf"

    try:
        with tempfile.TemporaryDirectory(prefix="radiance_render_") as tmp_dir:
            pdf_path = pdf_renderer.render_to_pdf(
                cv_data=payload.cv_data,
                output_dir=tmp_dir,
            )
            storage.upload_file(
                local_path=pdf_path,
                object_key=s3_key,
                content_type="application/pdf",
            )
        pdf_url = storage.generate_presigned_download_url(s3_key)
        logger.info("Workspace PDF rendered and uploaded: %s", s3_key)
        return RenderResponse(pdf_url=pdf_url, success=True)
    except RuntimeError as exc:
        logger.warning("Render failed: %s", exc)
        return RenderResponse(pdf_url="", success=False, error=str(exc))
    except Exception as exc:
        logger.error("Render failed: %s", exc, exc_info=True)
        return RenderResponse(
            pdf_url="",
            success=False,
            error="Failed to render or upload PDF. Please try again.",
        )
