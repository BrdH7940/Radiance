"""
FastAPI router for the workspace editor: refinements (AI rewrite) and renders (LaTeX → PDF).
"""

import logging
import tempfile
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from config import AppSettings, get_settings
from container import get_editor_ai_service, get_latex_compiler, get_storage_service
from core.ports.editor_ai_port import IEditorAIService
from core.ports.latex_compiler_port import ILaTeXCompilerService
from domain.ports import IStorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/editor", tags=["Editor"])


# ─── Refinements ─────────────────────────────────────────────────────────────


class RefinementRequest(BaseModel):
    selected_text: str = Field(..., description="LaTeX snippet to refine.")
    prompt: str = Field(..., description="User instruction (e.g. 'Make it STAR format').")


class RefinementResponse(BaseModel):
    new_text: str = Field(..., description="Refined LaTeX snippet.")


@router.post(
    "/refinements",
    response_model=RefinementResponse,
    status_code=status.HTTP_200_OK,
    summary="Refine selected LaTeX with AI",
)
async def create_refinement(
    payload: RefinementRequest,
    editor_ai: IEditorAIService = Depends(get_editor_ai_service),
) -> RefinementResponse:
    """Rewrite the selected LaTeX snippet according to the user prompt."""
    try:
        new_text = await editor_ai.refine(
            selected_text=payload.selected_text,
            prompt=payload.prompt,
        )
        return RefinementResponse(new_text=new_text)
    except Exception as exc:
        logger.warning("Refinement failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI refinement failed. Please try again.",
        ) from exc


# ─── Renders ─────────────────────────────────────────────────────────────────


class RenderRequest(BaseModel):
    latex_code: str = Field(..., description="Full LaTeX document to compile.")


class RenderResponse(BaseModel):
    pdf_url: str = Field(..., description="Presigned URL of the compiled PDF in S3.")
    success: bool = Field(True, description="Whether compilation and upload succeeded.")
    error: str | None = Field(None, description="Error message if success is False.")


@router.post(
    "/renders",
    response_model=RenderResponse,
    status_code=status.HTTP_200_OK,
    summary="Compile LaTeX to PDF and upload to S3",
)
async def create_render(
    payload: RenderRequest,
    storage: IStorageService = Depends(get_storage_service),
    compiler: ILaTeXCompilerService = Depends(get_latex_compiler),
) -> RenderResponse:
    """Compile the given LaTeX to PDF, upload to S3 enhanced-pdf/, return presigned URL."""
    settings: AppSettings = get_settings()
    s3_key = f"{settings.s3_enhanced_prefix}{uuid4().hex}_workspace.pdf"

    try:
        with tempfile.TemporaryDirectory(prefix="radiance_render_") as tmp_dir:
            pdf_path = compiler.compile_to_pdf(
                latex_code=payload.latex_code,
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
    except FileNotFoundError as exc:
        logger.warning("pdflatex not found: %s", exc)
        return RenderResponse(
            pdf_url="",
            success=False,
            error="PDF compilation is not available on this server (pdflatex not installed).",
        )
    except RuntimeError as exc:
        logger.warning("Compilation failed: %s", exc)
        return RenderResponse(
            pdf_url="",
            success=False,
            error=str(exc),
        )
    except Exception as exc:
        logger.error("Render failed: %s", exc, exc_info=True)
        return RenderResponse(
            pdf_url="",
            success=False,
            error="Failed to compile or upload PDF. Please try again.",
        )
