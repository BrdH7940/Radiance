"""
FastAPI router for the CV Enhancer presentation layer.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from application.dtos import EnhanceCVRequestDTO, EnhanceCVResponseDTO
from application.use_cases.enhance_cv_use_case import EnhanceCVUseCase
from container import get_enhance_cv_use_case

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/cv", tags=["CV Enhancer"])


@router.post(
    "/enhance",
    response_model=EnhanceCVResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Analyse and enhance a CV against a Job Description",
    description=(
        "Accepts a local path to a CV PDF and a Job Description string. "
        "Returns a matching score (0–100), a list of identified skill gaps, "
        "and a fully rewritten version of the CV using the STAR method — "
        "tailored and optimised for the target role."
    ),
    responses={
        404: {"description": "CV file not found at the provided path."},
        422: {"description": "Validation error or unparseable PDF."},
        500: {"description": "Unexpected server error."},
    },
)
async def enhance_cv(
    request: EnhanceCVRequestDTO,
    use_case: EnhanceCVUseCase = Depends(get_enhance_cv_use_case),
) -> EnhanceCVResponseDTO:
    """
    POST /api/v1/cv/enhance

    Runs the full CV enhancement pipeline:
    1. Parses the PDF.
    2. Sends the parsed text + JD to the AI agent.
    3. Returns the match score, skill gaps, and STAR-enhanced CV Markdown.
    """
    try:
        return await use_case.execute(request)
    except FileNotFoundError as exc:
        logger.warning("CV file not found: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        logger.warning("Invalid input or unparseable PDF: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error during CV enhancement: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again later.",
        ) from exc
