"""
FastAPI router for the CV History feature.

Endpoints
---------
GET    /api/v1/history           — list summaries of the user's past enhancements
GET    /api/v1/history/{id}      — fetch the full enhancement record (includes JSON + score)
PATCH  /api/v1/history/{id}      — rename / update editable metadata on an entry
DELETE /api/v1/history/{id}      — remove an entry from history

All endpoints require a valid Supabase Bearer token.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from container import get_history_repository
from core.domain.cv_history import CVHistoryEntry, CVHistorySummary
from core.ports.history_repository_port import IHistoryRepository
from presentation.dependencies.auth import get_current_user_id

router = APIRouter(prefix="/api/v1/history", tags=["CV History"])


# ---------------------------------------------------------------------------
# Request DTOs
# ---------------------------------------------------------------------------


class UpdateHistoryRequest(BaseModel):
    """Editable fields on a CV history entry. Send only the fields you want changed."""

    job_title: Optional[str] = Field(
        default=None,
        description="New job title (e.g. user-renamed entry). Pass an empty string to clear.",
    )
    company_name: Optional[str] = Field(
        default=None, description="New company name."
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


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


@router.patch(
    "/{history_id}",
    response_model=CVHistoryEntry,
    summary="Rename or update metadata on a CV history entry",
    description=(
        "Updates the editable metadata fields (job_title, company_name) of a "
        "history entry owned by the authenticated user. Other fields are immutable."
    ),
    responses={404: {"description": "History entry not found or not owned by this user."}},
)
async def update_history_entry(
    history_id: UUID,
    payload: UpdateHistoryRequest,
    user_id: str = Depends(get_current_user_id),
    repo: IHistoryRepository = Depends(get_history_repository),
) -> CVHistoryEntry:
    entry = await repo.update(
        user_id,
        history_id,
        job_title=payload.job_title,
        company_name=payload.company_name,
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"History entry '{history_id}' not found or does not belong to this user.",
        )
    return entry


@router.delete(
    "/{history_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a CV history entry",
    description="Permanently removes the history entry owned by the authenticated user.",
    responses={404: {"description": "History entry not found or not owned by this user."}},
)
async def delete_history_entry(
    history_id: UUID,
    user_id: str = Depends(get_current_user_id),
    repo: IHistoryRepository = Depends(get_history_repository),
) -> None:
    deleted = await repo.delete(user_id, history_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"History entry '{history_id}' not found or does not belong to this user.",
        )
    return None
