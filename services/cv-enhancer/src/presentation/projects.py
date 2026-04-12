"""
FastAPI router for the Project Gallery feature.

Endpoints
---------
GET    /api/v1/projects             — list the authenticated user's active projects
POST   /api/v1/projects             — create a new project
DELETE /api/v1/projects/{project_id} — soft-delete a project (sets is_active=False)

All endpoints require a valid Supabase Bearer token.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from container import get_project_repository
from core.domain.project import CreateProjectRequest, Project
from core.ports.project_repository_port import IProjectRepository
from presentation.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


@router.get(
    "",
    response_model=list[Project],
    summary="List projects in the gallery",
    description="Returns all active projects owned by the authenticated user.",
)
async def list_projects(
    user_id: str = Depends(get_current_user_id),
    repo: IProjectRepository = Depends(get_project_repository),
) -> list[Project]:
    return await repo.list(user_id)


@router.post(
    "",
    response_model=Project,
    status_code=status.HTTP_201_CREATED,
    summary="Add a project to the gallery",
    description="Creates a new project entry linked to the authenticated user.",
)
async def create_project(
    payload: CreateProjectRequest,
    user_id: str = Depends(get_current_user_id),
    repo: IProjectRepository = Depends(get_project_repository),
) -> Project:
    return await repo.create(user_id, payload)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a project from the gallery",
    description=(
        "Soft-deletes the project (sets is_active=False). "
        "Only the owning user can delete their own projects."
    ),
    responses={404: {"description": "Project not found or not owned by this user."}},
)
async def delete_project(
    project_id: UUID,
    user_id: str = Depends(get_current_user_id),
    repo: IProjectRepository = Depends(get_project_repository),
) -> None:
    deleted = await repo.delete(user_id, project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found or does not belong to this user.",
        )
