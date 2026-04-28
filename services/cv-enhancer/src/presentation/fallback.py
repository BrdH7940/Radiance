"""
FastAPI router for the client-side AI fallback endpoint.

Endpoint
--------
POST /api/v1/fallback/client-ai
    Receives a JD and the user's project gallery, uses Gemini 2.5 Flash to
    perform the same ranking + reasoning task as the browser WebWorker, and
    returns the Top-5 projects as ClientAIResult objects.

    This endpoint is called automatically by `aiClientService.ts` when the
    WebWorker fails to load (no WebGPU, out-of-memory, incompatible browser).
    It is intentionally designed to produce the same response shape so the
    UI doesn't need any branching logic.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from container import get_llm_service
from core.domain.gallery_schemas import ClientAIResult, FallbackClientAIRequest
from core.ports.llm_port import ILLMService
from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/fallback", tags=["Fallback"])


@router.post(
    "/client-ai",
    response_model=list[ClientAIResult],
    status_code=status.HTTP_200_OK,
    summary="Server-side fallback for client-side AI project ranking",
    description=(
        "Uses Gemini 2.5 Flash to rank and reason about the Top-5 projects from "
        "the user's gallery against the given JD. Called automatically when the "
        "browser WebWorker fails (no WebGPU / OOM). Auth required."
    ),
)
async def fallback_client_ai(
    payload: FallbackClientAIRequest,
    user_id: str = Depends(get_current_user_id),
    llm_service: ILLMService = Depends(get_llm_service),
) -> list[ClientAIResult]:
    """Rank and reason about projects server-side as a graceful degradation fallback."""

    if not payload.project_gallery:
        return []

    try:
        results = await llm_service.rank_projects_for_jd(
            jd_text=payload.jd_text,
            projects=payload.project_gallery,
        )
    except Exception as exc:
        logger.error(
            "Fallback client-AI failed for user '%s': %s", user_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI ranking service temporarily unavailable. Please try again.",
        ) from exc

    logger.info(
        "Fallback client-AI ranked %d/%d projects for user '%s'.",
        len(results),
        len(payload.project_gallery),
        user_id,
    )
    return results
