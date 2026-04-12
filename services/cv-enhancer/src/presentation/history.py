"""
FastAPI router for the CV History feature.

Endpoints
---------
GET /api/v1/history           — list summaries of the user's past enhancements
GET /api/v1/history/{id}      — fetch the full enhancement record (includes JSON + score)

All endpoints require a valid Supabase Bearer token.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from container import get_history_repository
from core.domain.cv_history import CVHistoryEntry, CVHistorySummary
from core.ports.history_repository_port import IHistoryRepository
from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/history", tags=["CV History"])


@router.get(
    "",
    response_model=list[CVHistorySummary],
    summary="List CV enhancement history",
    description=(
        "Returns a lightweight list of past CV enhancements for the authenticated user, "
        "ordered newest-first. Each entry includes the job title, company, and matching score."
    ),
)
async def list_history(
    user_id: str = Depends(get_current_user_id),
    repo: IHistoryRepository = Depends(get_history_repository),
) -> list[CVHistorySummary]:
    return await repo.list(user_id)


@router.get(
    "/{history_id}",
    response_model=CVHistoryEntry,
    summary="Fetch a specific CV history entry",
    description=(
        "Returns the full history record including the enhanced_cv_json payload, "
        "which can be used to restore a workspace session."
    ),
    responses={404: {"description": "History entry not found or not owned by this user."}},
)
async def get_history_entry(
    history_id: UUID,
    user_id: str = Depends(get_current_user_id),
    repo: IHistoryRepository = Depends(get_history_repository),
) -> CVHistoryEntry:
    entry = await repo.get_by_id(user_id, history_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"History entry '{history_id}' not found or does not belong to this user.",
        )
    return entry
